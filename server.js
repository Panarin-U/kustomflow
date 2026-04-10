import express from 'express';
import cors from 'cors';
import { simpleGit } from 'simple-git';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import yaml from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());

function buildRepoUrl(repoName, protocol) {
  if (protocol === 'http') {
    return `https://gitdev.devops.krungthai.com/cicd/kustomize/next/${repoName}.git`;
  }
  return `ssh://git@gitdev.devops.krungthai.com:2222/cicd/kustomize/next/${repoName}.git`;
}

async function cloneRepo(repoName, protocol = 'ssh') {
  const repoUrl = buildRepoUrl(repoName, protocol);
  const cloneDir = path.join(__dirname, 'git-repo', repoName);

  if (existsSync(cloneDir)) {
    return { alreadyExists: true, cloneDir };
  }

  const git = simpleGit();
  await git.clone(repoUrl, cloneDir);
  return { alreadyExists: false, cloneDir };
}

app.get('/api/repos', (_req, res) => {
  const gitRepoDir = path.join(__dirname, 'git-repo');
  if (!existsSync(gitRepoDir)) {
    return res.json({ repos: [] });
  }
  const repos = readdirSync(gitRepoDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  return res.json({ repos });
});

app.post('/api/clone', async (req, res) => {
  const { repoName, protocol } = req.body;

  if (!repoName) {
    return res.status(400).json({ error: 'repoName is required' });
  }

  try {
    const result = await cloneRepo(repoName, protocol);
    if (result.alreadyExists) {
      return res.status(200).json({ status: 'already_exists', message: `"${repoName}" is already cloned` });
    }
    return res.status(200).json({ status: 'cloned', message: `"${repoName}" cloned successfully` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/update-tag', async (req, res) => {
  const { repoName, newTag, env = 'stg', mrRelease = false } = req.body;

  if (!repoName || !newTag) {
    return res.status(400).json({ error: 'repoName and newTag are required' });
  }

  if (!['stg', 'prd', 'pfm'].includes(env)) {
    return res.status(400).json({ error: 'env must be "stg", "prd" or "pfm"' });
  }

  const cloneDir = path.join(__dirname, 'git-repo', repoName);

  if (!existsSync(cloneDir)) {
    return res.status(404).json({ error: `Repository "${repoName}" not found. Clone it first.` });
  }

  try {
    const repoGit = simpleGit(cloneDir);

    await repoGit.checkout('develop');
    await repoGit.pull('origin', 'develop');

    const kustomizationPath = path.join(cloneDir, `overlays/${env}/kustomization.yaml`);

    if (!existsSync(kustomizationPath)) {
      return res.status(404).json({ error: `overlays/${env}/kustomization.yaml not found in repository` });
    }

    const raw = readFileSync(kustomizationPath, 'utf8');
    const doc = yaml.parseDocument(raw);

    const images = doc.get('images');
    for (let i = 0; i < images.items.length; i++) {
      images.items[i].set('newTag', newTag);
    }

    writeFileSync(kustomizationPath, doc.toString({ indentSeq: false }), 'utf8');

    await repoGit.add(`overlays/${env}/kustomization.yaml`);
    await repoGit.commit(`update ${env} image tag to ${newTag}`);

    if (mrRelease) {
      await repoGit.raw([
        'push', 'origin', 'develop',
        '-o', 'merge_request.create',
        '-o', 'merge_request.target=release',
        '-o', `merge_request.title=update tag ${newTag}`,
      ]);
    } else {
      await repoGit.push('origin', 'develop');
    }

    const mrNote = mrRelease ? ' and MR to release created' : '';
    return res.status(200).json({ status: 'updated', message: `Tag updated to "${newTag}" on ${env} and pushed to develop${mrNote}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/config', (req, res) => {
  const { repoName, env } = req.query;
  if (!repoName || !env) {
    return res.status(400).json({ error: 'repoName and env are required' });
  }

  const base = path.join(__dirname, 'git-repo', repoName, `overlays/${env}`);
  const configPath = path.join(base, 'configs/config.env');
  const secretPath = path.join(base, 'secrets/secret.env');

  const result = {};
  result.config = existsSync(configPath) ? readFileSync(configPath, 'utf8') : null;
  result.secret = existsSync(secretPath) ? readFileSync(secretPath, 'utf8') : null;

  if (result.config === null && result.secret === null) {
    return res.status(404).json({ error: 'No config.env or secret.env found' });
  }

  return res.json(result);
});

app.post('/api/save-config', async (req, res) => {
  const { repoName, env, config, secret } = req.body;
  if (!repoName || !env) {
    return res.status(400).json({ error: 'repoName and env are required' });
  }

  const cloneDir = path.join(__dirname, 'git-repo', repoName);
  const base = path.join(cloneDir, `overlays/${env}`);
  const filesToAdd = [];

  try {
    if (config !== undefined) {
      const configPath = path.join(base, 'configs/config.env');
      if (!existsSync(configPath)) {
        return res.status(404).json({ error: 'configs/config.env not found' });
      }
      writeFileSync(configPath, config, 'utf8');
      filesToAdd.push(`overlays/${env}/configs/config.env`);
    }
    if (secret !== undefined) {
      const secretPath = path.join(base, 'secrets/secret.env');
      if (!existsSync(secretPath)) {
        return res.status(404).json({ error: 'secrets/secret.env not found' });
      }
      writeFileSync(secretPath, secret, 'utf8');
      filesToAdd.push(`overlays/${env}/secrets/secret.env`);
    }

    const repoGit = simpleGit(cloneDir);
    await repoGit.add(filesToAdd);

    const diffStat = await repoGit.diff(['--cached', '--stat']);
    if (!diffStat.trim()) {
      return res.json({ status: 'saved', message: 'No changes to commit' });
    }

    await repoGit.commit(`update ${env} config`);
    await repoGit.push('origin', 'develop');

    return res.json({ status: 'saved', message: 'Config saved and pushed to develop' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => console.log('Server running on http://localhost:3001'));
