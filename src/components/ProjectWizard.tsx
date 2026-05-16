import React, { useCallback, useState } from 'react';

type WizardStep = 'welcome' | 'empty' | 'template' | 'clone' | 'open' | 'progress';

// ─── Clone authentication types ──────────────

interface CloneAuthConfig {
  authType: 'none' | 'token' | 'ssh_key' | 'credential_helper';
  token?: string;        // GitHub/GitLab PAT (masked)
  sshKeyPath?: string;   // Path to SSH private key file
}

const KNOWN_SSH_KEYS = [
  '~/.ssh/id_rsa',
  '~/.ssh/id_ed25519',
  '~/.ssh/id_ecdsa',
  '~/.ssh/id_dsa',
];

interface TemplateOption {
  id: string;
  name: string;
  description: string;
  icon: string;
  files: Array<{ path: string; content: string }>;
  installCmd?: string;
}

const TEMPLATES: TemplateOption[] = [
  {
    id: 'react-ts',
    name: 'React + TypeScript',
    description: 'Vite + React + TS starter with Tailwind CSS',
    icon: '⚛️',
    files: [
      { path: 'package.json', content: JSON.stringify({ name: 'my-app', version: '1.0.0', private: true, scripts: { dev: 'vite', build: 'tsc && vite build', preview: 'vite preview' }, dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' }, devDependencies: { typescript: '~5.7.2', '@types/react': '^19.0.10', '@types/react-dom': '^19.0.4', vite: '^6.1.0', '@vitejs/plugin-react': '^4.3.4', tailwindcss: '^3.4.17' } }, null, 2) },
      { path: 'src/index.tsx', content: "import React from 'react';\nimport ReactDOM from 'react-dom/client';\n\nReactDOM.createRoot(document.getElementById('root')!).render(<h1>Hello World</h1>);\n" },
      { path: 'index.html', content: '<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"/><title>My App</title></head>\n<body><div id="root"></div><script type="module" src="/src/index.tsx"></script></body>\n</html>' },
    ],
    installCmd: 'npm install',
  },
  {
    id: 'node-express',
    name: 'Node.js + Express',
    description: 'Express API server with TypeScript',
    icon: '🟢',
    files: [
      { path: 'package.json', content: JSON.stringify({ name: 'my-api', version: '1.0.0', scripts: { dev: 'tsx src/index.ts' }, dependencies: { express: '^5.1.0' }, devDependencies: { typescript: '~5.7.2', tsx: '^4.19.2' } }, null, 2) },
      { path: 'src/index.ts', content: "import express from 'express';\nconst app = express();\napp.get('/', (req, res) => res.json({ hello: 'world' }));\napp.listen(3000, () => console.log('Server on :3000'));\n" },
    ],
    installCmd: 'npm install',
  },
  {
    id: 'python-fastapi',
    name: 'Python + FastAPI',
    description: 'FastAPI web framework with uvicorn',
    icon: '🐍',
    files: [
      { path: 'main.py', content: "from fastapi import FastAPI\napp = FastAPI()\n\n@app.get('/')\ndef root():\n    return {'hello': 'world'}\n" },
      { path: 'requirements.txt', content: 'fastapi==0.115.6\nuvicorn==0.34.0\n' },
    ],
    installCmd: 'pip install -r requirements.txt',
  },
  {
    id: 'go-echo',
    name: 'Go + Echo',
    description: 'Echo web framework starter',
    icon: '🔵',
    files: [
      { path: 'main.go', content: "package main\n\nimport (\n\t\"net/http\"\n\t\"github.com/labstack/echo/v4\"\n)\n\nfunc main() {\n\te := echo.New()\n\te.GET(\"/\", func(c echo.Context) error {\n\t\treturn c.JSON(http.StatusOK, map[string]string{\"hello\": \"world\"})\n\t})\n\te.Start(\":8080\")\n}\n" },
    ],
    installCmd: 'go mod init my-app && go mod tidy',
  },
  {
    id: 'rust-axum',
    name: 'Rust + Axum',
    description: 'Axum web framework with Tokio runtime',
    icon: '🦀',
    files: [
      { path: 'Cargo.toml', content: `[package]
name = "my-app"
version = "0.1.0"
edition = "2024"

[dependencies]
axum = "0.8"` },
      { path: 'src/main.rs', content: "use axum::{routing::get, Router};\n\n#[tokio::main]\nasync fn main() {\n    let app = Router::new().route(\"/\", get(|| async { \"Hello World\" }));\n    axum::Server::bind(&\"0.0.0.0:3000\".parse().unwrap())\n        .serve(app.into_make_service())\n        .await\n        .unwrap();\n}\n" },
    ],
  },
  {
    id: 'dotnet-api',
    name: '.NET API',
    description: 'ASP.NET Core minimal API',
    icon: '💜',
    files: [
      { path: 'Program.cs', content: "var app = WebApplication.Create(args);\napp.MapGet(\"/\", () => new { hello = \"world\" });\napp.Run();\n" },
    ],
    installCmd: 'dotnet run',
  },
];

interface ProjectWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

// Helper to expand ~ in paths (Fix for cross-platform path handling)
function expandHome(p: string): string {
  if (!p.startsWith('~')) return p;
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return home ? `${home}/${p.slice(2)}` : p;
}

// Helper to check if a URL is likely private (GitHub/GitLab/Bitbucket pattern matching)
function detectProvider(url: string): 'github' | 'gitlab' | 'bitbucket' | null {
  if (url.includes('github.com')) return 'github';
  if (url.includes('gitlab.com') || url.includes('gitlab.')) return 'gitlab';
  if (url.includes('bitbucket.org')) return 'bitbucket';
  return null;
}

// Helper to build authenticated clone URL from PAT — embeds token in HTTPS URL for authentication
function buildAuthenticatedUrl(originalUrl: string, token: string): string {
  // Replace https://host.com/ with https://user:token@host.com/ 
  const authPrefix = 'https://';
  if (originalUrl.startsWith(authPrefix)) {
    return originalUrl.replace(
      /\/\/([^/@]+)@/,
      `//${encodeURIComponent('x-access-token')}:${encodeURIComponent(token)}@`
    );
  }
  // Handle git@ host:pattern — convert to HTTPS with token
  if (originalUrl.startsWith('git@')) {
    const https = originalUrl.replace(':', '/').replace(/.*:/, '');
    return authPrefix + 'x-access-token:' + token + '@' + https;
  }
  return originalUrl;
}

// Helper to build SSH clone command with a specific key — uses GIT_SSH_COMMAND for custom key path
function buildSshCloneCommand(sshKeyPath: string): string {
  const expanded = expandHome(sshKeyPath);
  return `GIT_SSH_COMMAND="ssh -i ${expanded} -o StrictHostKeyChecking=no" `;
}

export const ProjectWizard: React.FC<ProjectWizardProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  const [step, setStep] = useState<WizardStep>('welcome');
  const [projectName, setProjectName] = useState('my-project');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [cloneUrl, setCloneUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');

  // Lift authConfig up so cloneRepository callback can access it (Fix for TS2304: Cannot find name 'authConfig')
  const [cloneAuthConfig, setCloneAuthConfig] = useState<CloneAuthConfig>({ authType: 'none' });

  // Use ref to ensure cloneRepository reads the latest state at call time, not stale closure
  const cloneAuthRef = React.useRef(cloneAuthConfig);
  cloneAuthRef.current = cloneAuthConfig;

  // Create an empty project
  const createEmptyProject = useCallback(async () => {
    setStep('progress');
    setStatusMsg('Creating project directory...');
    setProgress(10);

    try {
      const root = await window.api.fs.getProjectRoot();
      const newRoot = `${root}/${projectName}`;

      // Set the new root FIRST so subsequent file writes go to the right place (Fix #16)
      setStatusMsg('Setting project root...');
      setProgress(40);
      await window.api.fs.setProjectRoot(newRoot);

      // Create .gitkeep to ensure the folder exists in the new directory (Fix #16)
      setStatusMsg('Initializing files...');
      setProgress(80);
      await window.api.fs.writeFile('.gitkeep', '');

      setStatusMsg('Done!');
      setProgress(100);
      setTimeout(onClose, 500);
    } catch (err) {
      setStatusMsg(`Error: ${err}`);
    }
  }, [projectName, onClose]);

  // Create from template
  const createFromTemplate = useCallback(async () => {
    if (!selectedTemplate) return;
    const tmpl = TEMPLATES.find((t) => t.id === selectedTemplate);
    if (!tmpl) return;

    setStep('progress');
    setStatusMsg(`Creating ${tmpl.name} project...`);
    setProgress(10);

    try {
      // Write all template files
      for (let i = 0; i < tmpl.files.length; i++) {
        const f = tmpl.files[i];
        setStatusMsg(`Writing ${f.path}...`);
        await window.api.fs.writeFile(f.path, f.content);
        setProgress(10 + Math.round((i / tmpl.files.length) * 60));
      }

      // Run install command if defined
      if (tmpl.installCmd) {
        setStatusMsg(`Installing dependencies...`);
        setProgress(80);
        try {
          await window.api.execCommand(tmpl.installCmd);
        } catch {
          // Non-fatal — continue anyway
        }
      }

      setStatusMsg('Done!');
      setProgress(100);
      setTimeout(onClose, 500);
    } catch (err) {
      setStatusMsg(`Error: ${err}`);
    }
  }, [selectedTemplate, onClose]);

  // Clone a repository — with optional auth support for private repos  
  const cloneRepository = useCallback(async () => {
    if (!cloneUrl.trim()) return;

    setStep('progress');
    setStatusMsg('Cloning repository...');
    setProgress(10);

    try {
      const root = await window.api.fs.getProjectRoot();
      const name = projectName || cloneUrl.split('/').pop()?.replace('.git', '') || 'cloned-project';
      const newRoot = `${root}/${name}`;

      setStatusMsg(`Cloning ${cloneUrl}...`);
      setProgress(30);

      // Read from ref — ensures latest state at call time, not stale closure
      const currentAuth = cloneAuthRef.current;
      
      let fullCmd: string;
      
      if (currentAuth.authType === 'token' && currentAuth.token) {
        const authenticatedUrl = buildAuthenticatedUrl(cloneUrl, currentAuth.token);
        fullCmd = `git clone "${authenticatedUrl}" "${newRoot}"`;
        setStatusMsg(`Cloning (using token)...`);
      } else if (currentAuth.authType === 'ssh_key' && currentAuth.sshKeyPath) {
        const sshCmd = buildSshCloneCommand(currentAuth.sshKeyPath);
        fullCmd = `${sshCmd}git clone "${cloneUrl}" "${newRoot}"`;
        setStatusMsg(`Cloning (using SSH key)...`);
      } else if (currentAuth.authType === 'credential_helper') {
        fullCmd = `git clone --config core.autocrlf=false "${cloneUrl}" "${newRoot}"`;
        setStatusMsg(`Cloning (using credentials manager)...`);
      } else {
        // No authentication — assume public repo
        fullCmd = `git clone "${cloneUrl}" "${newRoot}"`;
      }

      await window.api.execCommand(fullCmd);
      setProgress(80);

      setStatusMsg('Setting project root...');
      setProgress(90);
      await window.api.fs.setProjectRoot(newRoot);

      setStatusMsg('Done!');
      setProgress(100);
      setTimeout(onClose, 500);
    } catch (err) {
      setStatusMsg(`Error: ${err}`);
    }
  }, [cloneUrl, projectName, onClose]);

  // Open an existing folder
  const openExistingFolder = useCallback(async () => {
    setStep('progress');
    setStatusMsg('Selecting folder...');
    setProgress(50);

    try {
      const selectedPath = await window.api.dialog.selectFolder();
      if (!selectedPath) {
        setStatusMsg('No folder selected.');
        return;
      }

      setStatusMsg('Setting project root...');
      setProgress(80);
      await window.api.fs.setProjectRoot(selectedPath);

      setStatusMsg('Done!');
      setProgress(100);
      setTimeout(onClose, 500);
    } catch (err) {
      setStatusMsg(`Error: ${err}`);
    }
  }, [onClose]);

  // ─── Render steps ──────────────

  if (step === 'progress') {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-[#1e1e2e] rounded-xl p-8 w-full max-w-md border border-[#313244]" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg font-semibold text-[#cdd6f4] mb-4">Creating Project...</h2>

          {/* Progress bar */}
          <div className="w-full bg-[#313244] rounded-full h-2.5 mb-3 overflow-hidden">
            <div
              className="bg-[#89b4fa] h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Status message */}
          <p className="text-sm text-[#6c7086]">{statusMsg}</p>

          {progress >= 100 && (
            <button
              onClick={onClose}
              className="mt-4 w-full py-2 bg-[#89b4fa] hover:bg-[#74c7ec] text-[#1e1e2e] font-medium rounded-lg transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    );
  }

  if (step === 'empty') {
    return (
      <EmptyProjectStep
        projectName={projectName}
        setProjectName={setProjectName}
        onCreate={createEmptyProject}
        onBack={() => setStep('welcome')}
        onClose={onClose}
      />
    );
  }

  if (step === 'template') {
    return (
      <TemplateStep
        selectedTemplate={selectedTemplate}
        setSelectedTemplate={setSelectedTemplate}
        projectName={projectName}
        setProjectName={setProjectName}
        onCreate={createFromTemplate}
        onBack={() => setStep('welcome')}
        onClose={onClose}
      />
    );
  }

  if (step === 'clone') {
    return (
      <CloneStep
        cloneUrl={cloneUrl}
        setCloneUrl={setCloneUrl}
        projectName={projectName}
        setProjectName={setProjectName}
        onClone={cloneRepository}
        onBack={() => setStep('welcome')}
        onClose={onClose}
        authConfig={cloneAuthConfig}
        setAuthConfig={setCloneAuthConfig}
      />
    );
  }

  if (step === 'open') {
    return (
      <OpenFolderStep
        onOpen={openExistingFolder}
        onBack={() => setStep('welcome')}
        onClose={onClose}
      />
    );
  }

  // ─── Welcome step ──────────────
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#1e1e2e] rounded-xl p-8 w-full max-w-md border border-[#313244]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-[#cdd6f4] mb-2">🚀 Welcome to OpenLLMCode</h2>
        <p className="text-sm text-[#6c7086] mb-6">No project open. Create one now:</p>

        <div className="space-y-3">
          <button
            onClick={() => setStep('empty')}
            className="w-full flex items-center gap-3 p-4 bg-[#181825] hover:bg-[#313244] rounded-lg border border-[#313244] transition-colors text-left"
          >
            <span className="text-2xl">📄</span>
            <div>
              <p className="font-medium text-[#cdd6f4]">Empty Project</p>
              <p className="text-xs text-[#6c7086]">Start from scratch</p>
            </div>
          </button>

          <button
            onClick={() => setStep('template')}
            className="w-full flex items-center gap-3 p-4 bg-[#181825] hover:bg-[#313244] rounded-lg border border-[#313244] transition-colors text-left"
          >
            <span className="text-2xl">📦</span>
            <div>
              <p className="font-medium text-[#cdd6f4]">From Template</p>
              <p className="text-xs text-[#6c7086]">Starter boilerplates for popular frameworks</p>
            </div>
          </button>

          <button
            onClick={() => setStep('clone')}
            className="w-full flex items-center gap-3 p-4 bg-[#181825] hover:bg-[#313244] rounded-lg border border-[#313244] transition-colors text-left"
          >
            <span className="text-2xl">🔗</span>
            <div>
              <p className="font-medium text-[#cdd6f4]">Clone Repository</p>
              <p className="text-xs text-[#6c7086]">GitHub, GitLab, or Bitbucket URL</p>
            </div>
          </button>

          <button
            onClick={() => setStep('open')}
            className="w-full flex items-center gap-3 p-4 bg-[#181825] hover:bg-[#313244] rounded-lg border border-[#313244] transition-colors text-left"
          >
            <span className="text-2xl">📂</span>
            <div>
              <p className="font-medium text-[#cdd6f4]">Open Existing Folder</p>
              <p className="text-xs text-[#6c7086]">Browse to an existing project directory</p>
            </div>
          </button>
        </div>

        <button onClick={onClose} className="mt-4 w-full py-2 text-[#6c7086] hover:text-[#cdd6f4] transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
};

// ─── Authentication sub-step — shown when cloning private repos ──────────────

const CloneAuthOptions: React.FC<{
  cloneUrl: string;
  config: CloneAuthConfig;
  setConfig: (c: CloneAuthConfig) => void;
}> = ({ cloneUrl, config, setConfig }) => {
  const [tokenVisible, setTokenVisible] = useState(false);

  return (
    <div className="border border-[#313244] rounded-lg bg-[#181825] p-4 mb-4">
      <p className="text-xs text-[#9399b2] mb-3 font-medium uppercase tracking-wider">Authentication (optional)</p>

      {/* Auth type selector */}
      <div className="flex flex-wrap gap-2 mb-3">
        {([
          { value: 'none', label: 'None' },
          { value: 'token', label: 'Token' },
          { value: 'ssh_key', label: 'SSH Key' },
          { value: 'credential_helper', label: 'Credential Helper' },
        ] as const).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setConfig({ ...config, authType: value, token: undefined, sshKeyPath: undefined })}
            className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
              config.authType === value
                ? 'bg-[#89b4fa] border-[#89b4fa] text-[#1e1e2e]'
                : 'bg-[#1e1e2e] border-[#313244] text-[#cdd6f4] hover:bg-[#313244]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Token input */}
      {config.authType === 'token' && (
        <div className="space-y-2">
          <p className="text-xs text-[#6c7086]">
            Personal Access Token for {detectProvider(cloneUrl) ? detectProvider(cloneUrl)!.charAt(0).toUpperCase() + detectProvider(cloneUrl)!.slice(1) : 'the repository'}
          </p>
          <div className="flex gap-2">
            <input
              type={tokenVisible ? 'text' : 'password'}
              value={config.token || ''}
              onChange={(e) => setConfig({ ...config, token: e.target.value })}
              placeholder="ghp_xxxxxxxxxxxx"
              className="flex-1 px-3 py-2 bg-[#1e1e2e] border border-[#313244] rounded-lg text-sm text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
            />
            <button
              type="button"
              onClick={() => setTokenVisible(!tokenVisible)}
              className="px-2.5 py-2 bg-[#1e1e2e] border border-[#313244] rounded-lg text-xs text-[#6c7086] hover:text-[#cdd6f4] transition-colors"
            >
              {tokenVisible ? '👁️' : '🙈'}
            </button>
          </div>
        </div>
      )}

      {/* SSH key selector */}
      {config.authType === 'ssh_key' && (
        <div className="space-y-2">
          <p className="text-xs text-[#6c7086]">Choose an SSH private key for authentication:</p>
          <select
            value={config.sshKeyPath || ''}
            onChange={(e) => setConfig({ ...config, sshKeyPath: e.target.value })}
            className="w-full px-3 py-2 bg-[#1e1e2e] border border-[#313244] rounded-lg text-sm text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
          >
            <option value="">— Select a key —</option>
            {KNOWN_SSH_KEYS.map((keyPath) => (
              <option key={keyPath} value={keyPath}>{keyPath}</option>
            ))}
            <option value="__custom">Custom path...</option>
          </select>
          {/* Custom SSH key input — shown when "Custom path..." is selected */}
          {config.sshKeyPath === '__custom' && (
            <input
              type="text"
              value={config.sshKeyPath || ''}
              onChange={(e) => setConfig({ ...config, sshKeyPath: e.target.value })}
              placeholder="/path/to/your/private/key"
              className="w-full px-3 py-2 bg-[#1e1e2e] border border-[#313244] rounded-lg text-sm text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
            />
          )}
        </div>
      )}

      {/* Credential helper — just an info note */}
      {config.authType === 'credential_helper' && (
        <p className="text-xs text-[#6c7086]">
          Uses your system's Git credential helper (e.g., Windows Credential Manager or macOS Keychain). 
          You'll be prompted by the OS if authentication is needed.
        </p>
      )}

      {/* Provider info — shows what type of repo this looks like */}
      {cloneUrl.trim() && detectProvider(cloneUrl) && (
        <div className="mt-2 px-2 py-1 bg-[#89b4fa]/10 border border-[#89b4fa]/30 rounded text-xs text-[#89b4fa]">
          Detected: {detectProvider(cloneUrl)!.charAt(0).toUpperCase() + detectProvider(cloneUrl)!.slice(1)} repository — use a PAT for best results
        </div>
      )}
    </div>
  );
};

// ─── Sub-steps ──────────────

const EmptyProjectStep: React.FC<{
  projectName: string;
  setProjectName: (v: string) => void;
  onCreate: () => void;
  onBack: () => void;
  onClose: () => void;
}> = ({ projectName, setProjectName, onCreate, onBack }) => (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onBack}>
    <div className="bg-[#1e1e2e] rounded-xl p-8 w-full max-w-md border border-[#313244]" onClick={(e) => e.stopPropagation()}>
      <h2 className="text-lg font-semibold text-[#cdd6f4] mb-4">📄 Empty Project</h2>

      <label className="block text-sm text-[#9399b2] mb-1">Project Name</label>
      <input
        type="text"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        className="w-full px-3 py-2 bg-[#181825] border border-[#313244] rounded-lg text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
      />

      <div className="flex gap-3 mt-6">
        <button onClick={onBack} className="flex-1 py-2 border border-[#313244] text-[#cdd6f4] rounded-lg hover:bg-[#313244] transition-colors">
          Back
        </button>
        <button onClick={onCreate} className="flex-1 py-2 bg-[#89b4fa] hover:bg-[#74c7ec] text-[#1e1e2e] font-medium rounded-lg transition-colors">
          Create
        </button>
      </div>
    </div>
  </div>
);

const TemplateStep: React.FC<{
  selectedTemplate: string | null;
  setSelectedTemplate: (v: string) => void;
  projectName: string;
  setProjectName: (v: string) => void;
  onCreate: () => void;
  onBack: () => void;
  onClose: () => void;
}> = ({ selectedTemplate, setSelectedTemplate, projectName, setProjectName, onCreate, onBack }) => (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onBack}>
    <div className="bg-[#1e1e2e] rounded-xl p-8 w-full max-w-md border border-[#313244]" onClick={(e) => e.stopPropagation()}>
      <h2 className="text-lg font-semibold text-[#cdd6f4] mb-4">📦 Choose a Template</h2>

      <label className="block text-sm text-[#9399b2] mb-1">Project Name</label>
      <input
        type="text"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        className="w-full px-3 py-2 bg-[#181825] border border-[#313244] rounded-lg text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa] mb-4"
      />

      <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-thin">
        {TEMPLATES.map((tmpl) => (
          <button
            key={tmpl.id}
            onClick={() => setSelectedTemplate(tmpl.id)}
            className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${selectedTemplate === tmpl.id ? 'bg-[#89b4fa]/10 border-[#89b4fa]' : 'bg-[#181825] border-[#313244] hover:bg-[#313244]'}`}
          >
            <span className="text-xl">{tmpl.icon}</span>
            <div>
              <p className="font-medium text-[#cdd6f4] text-sm">{tmpl.name}</p>
              <p className="text-xs text-[#6c7086]">{tmpl.description}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex gap-3 mt-6">
        <button onClick={onBack} className="flex-1 py-2 border border-[#313244] text-[#cdd6f4] rounded-lg hover:bg-[#313244] transition-colors">
          Back
        </button>
        <button
          onClick={onCreate}
          disabled={!selectedTemplate}
          className="flex-1 py-2 bg-[#89b4fa] hover:bg-[#74c7ec] text-[#1e1e2e] font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create
        </button>
      </div>
    </div>
  </div>
);

const CloneStep: React.FC<{
  cloneUrl: string;
  setCloneUrl: (v: string) => void;
  projectName: string;
  setProjectName: (v: string) => void;
  onClone: () => void;
  onBack: () => void;
  onClose: () => void;
  authConfig: CloneAuthConfig;
  setAuthConfig: React.Dispatch<React.SetStateAction<CloneAuthConfig>>;
}> = ({ cloneUrl, setCloneUrl, projectName, setProjectName, onClone, onBack, onClose, authConfig, setAuthConfig }) => {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onBack}>
      <div className="bg-[#1e1e2e] rounded-xl p-8 w-full max-w-md border border-[#313244]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-[#cdd6f4] mb-4">🔗 Clone Repository</h2>

        <label className="block text-sm text-[#9399b2] mb-1">Repository URL</label>
        <input
          type="text"
          value={cloneUrl}
          onChange={(e) => setCloneUrl(e.target.value)}
          placeholder="https://github.com/user/repo.git"
          className="w-full px-3 py-2 bg-[#181825] border border-[#313244] rounded-lg text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa] mb-3"
        />

        <label className="block text-sm text-[#9399b2] mb-1">Project Name (optional)</label>
        <input
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Auto-detected from URL"
          className="w-full px-3 py-2 bg-[#181825] border border-[#313244] rounded-lg text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
        />

        {/* Authentication options — expandable */}
        <div className="mt-4">
          <CloneAuthOptions cloneUrl={cloneUrl} config={authConfig} setConfig={setAuthConfig} />
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onBack} className="flex-1 py-2 border border-[#313244] text-[#cdd6f4] rounded-lg hover:bg-[#313244] transition-colors">
            Back
          </button>
          <button
            onClick={onClone}
            disabled={!cloneUrl.trim()}
            className="flex-1 py-2 bg-[#89b4fa] hover:bg-[#74c7ec] text-[#1e1e2e] font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clone
          </button>
        </div>
      </div>
    </div>
  );
};

const OpenFolderStep: React.FC<{
  onOpen: () => void;
  onBack: () => void;
  onClose: () => void;
}> = ({ onOpen, onBack, onClose }) => (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onBack}>
    <div className="bg-[#1e1e2e] rounded-xl p-8 w-full max-w-md border border-[#313244]" onClick={(e) => e.stopPropagation()}>
      <h2 className="text-lg font-semibold text-[#cdd6f4] mb-4">📂 Open Existing Folder</h2>

      <p className="text-sm text-[#6c7086] mb-6">Click the button below to select a project directory from your machine.</p>

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 py-2 border border-[#313244] text-[#cdd6f4] rounded-lg hover:bg-[#313244] transition-colors">
          Back
        </button>
        <button onClick={onOpen} className="flex-1 py-2 bg-[#89b4fa] hover:bg-[#74c7ec] text-[#1e1e2e] font-medium rounded-lg transition-colors">
          Select Folder
        </button>
      </div>
    </div>
  </div>
);