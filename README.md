# kustomflow

A web UI for managing Kustomize image tags and configs across GitLab repositories.

## Requirements

- Node.js 18+
- Git with SSH key configured (for SSH clone)
- Access to `gitdev.devops.krungthai.com`

## Installation

```bash
# Install root dependencies
npm install

# Install web dependencies
cd web && npm install && cd ..
```

## Start

```bash
npm run dev
```

This starts both servers concurrently:

| Service | URL |
|---------|-----|
| API server | http://localhost:3001 |
| Web UI | http://localhost:5173 |

---

## Features

### Clone Repository

1. Open the **Clone Repository** tab
2. Choose protocol: **SSH** or **HTTP**
3. Enter the repository name (e.g. `processor-otp-validation`)
4. Click **Clone**

The repo will be cloned into `git-repo/<repo-name>/`.
If already cloned, an alert is shown and nothing is re-downloaded.

**SSH pattern:**
```
ssh://git@gitdev.devops.krungthai.com:2222/cicd/kustomize/next/<repo>.git
```

**HTTP pattern:**
```
https://gitdev.devops.krungthai.com/cicd/kustomize/next/<repo>.git
```

---

### Update Image Tag

1. Open the **Update Image Tag** tab
2. Select environment: **STG** or **PRD**
3. Choose a repository from the dropdown (populated from `git-repo/`)
4. Enter the new image tag
5. *(Optional)* Check **MR Release** to auto-create a merge request to `release` branch
6. Click **Update Tag**

On success, a link to the repository's merge requests page is shown with a copy button.

**Multiple repositories** can be updated at once using **+ Add Repository**.
Each dropdown filters out repos already selected in other entries.

#### MR Release

When checked, the push command includes GitLab push options:
```
-o merge_request.create
-o merge_request.target=release
-o merge_request.title=update tag <tag>
```

---

### Preview Config

Each repository entry has a **Preview Config** button (visible after selecting a repo).

Click it to open an editable panel showing:

- `overlays/<env>/configs/config.env`
- `overlays/<env>/secrets/secret.env`

Edit the content directly and click **Save** to write changes back to disk.

---

## Project Structure

```
kustomflow/
├── server.js          # Express API (port 3001)
├── index.js           # Standalone git script (reference)
├── package.json
├── .gitignore
├── git-repo/          # Cloned repositories (git-ignored)
└── web/               # React (Vite) frontend
    └── src/
        ├── App.jsx
        └── App.css
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/repos` | List cloned repos in `git-repo/` |
| POST | `/api/clone` | Clone a repo `{ repoName, protocol }` |
| POST | `/api/update-tag` | Update image tag `{ repoName, newTag, env, mrRelease }` |
| GET | `/api/config` | Read config/secret env files `?repoName=&env=` |
| POST | `/api/save-config` | Save config/secret env files `{ repoName, env, config, secret }` |
