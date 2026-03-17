import { simpleGit } from 'simple-git';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import yaml from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function cloneRepo(repoName) {
  const repoUrl = `ssh://git@gitdev.devops.krungthai.com:2222/cicd/kustomize/next/${repoName}.git`;
  const cloneDir = path.join(__dirname, 'git-repo', repoName);

  if (!existsSync(cloneDir)) {
    const git = simpleGit();
    await git.clone(repoUrl, cloneDir);
    console.log('Cloned successfully to', cloneDir);
  } else {
    console.log('Directory already exists, skipping clone');
  }

  return cloneDir;
}

const cloneDir = await cloneRepo('orchestrator-otp-validation');

// Checkout branch develop
const repoGit = simpleGit(cloneDir);
await repoGit.checkout('develop');
console.log('Checked out branch: develop');

// Update newTag in kustomization.yaml
const kustomizationPath = path.join(cloneDir, 'overlays/stg/kustomization.yaml');
const raw = readFileSync(kustomizationPath, 'utf8');
const doc = yaml.parseDocument(raw);

const images = doc.get('images');
for (let i = 0; i < images.items.length; i++) {
  images.items[i].set('newTag', '2026.4.1');
}

writeFileSync(kustomizationPath, doc.toString({ indentSeq: false }), 'utf8');
console.log('Updated newTag to 2026.4.1');

// Commit and push
await repoGit.add('overlays/stg/kustomization.yaml');
await repoGit.commit('update stg image tag to 2026.4.0');
await repoGit.push('origin', 'develop');
console.log('Committed and pushed to develop');
