const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (query, defaultVal) => new Promise(resolve => {
  rl.question(`${query} [${defaultVal}]: `, answer => {
    resolve(answer.trim() || defaultVal);
  });
});

async function run() {
  console.log("🚀 Welcome to the GS App Template Kickstarter!\\n");
  
  const projectName = await ask("Project Name", "My App");
  const projectSlug = await ask("Project Slug", projectName.toLowerCase().replace(/[^a-z0-9]/g, '-'));
  const ownerEmail = await ask("Owner Email", "admin@example.com");
  const bundleId = await ask("App Bundle ID", "com.example.myapp");
  const githubUser = await ask("GitHub Username/Org", "myorg");
  const githubRepo = await ask("GitHub Repository Name", projectSlug);
  
  let hosting = '';
  while (!['github-pages', 'vercel', 'firebase'].includes(hosting)) {
    hosting = await ask("Web Hosting Provider (github-pages, vercel, firebase)", "github-pages");
  }
  
  rl.close();

  const targetDir = path.join(__dirname, '..', projectSlug);
  if (fs.existsSync(targetDir)) {
    console.error(`Error: Directory ${targetDir} already exists.`);
    process.exit(1);
  }

  console.log(`\\nGenerating project in ${targetDir}...`);
  fs.cpSync(path.join(__dirname, 'template'), targetDir, { recursive: true });

  // Handle Hosting Options
  let hostingInstructions = "";
  let webWrapperUrlCode = "";
  if (hosting === 'github-pages') {
    webWrapperUrlCode = "\`https://${githubUser}.github.io/${githubRepo}/${IS_UAT ? 'uat/' : ''}\`";
    hostingInstructions = `## 2. GitHub Pages Setup
1. Go to your GitHub repository settings > Pages.
2. Ensure you have environments set up for \`github-pages\` allowing branches \`main\` and \`develop\`.
3. Pushes to \`main\` and \`develop\` will automatically build the composite site via the included GitHub Actions.`;
  } 
  else if (hosting === 'vercel') {
    fs.unlinkSync(path.join(targetDir, '.github/workflows/deploy-web-portal.yml'));
    webWrapperUrlCode = "\`https://${projectSlug}.vercel.app/${IS_UAT ? '?env=uat' : ''}\`";
    hostingInstructions = `## 2. Vercel Setup
1. Go to [Vercel.com](https://vercel.com) and click "Add New Project".
2. Import this GitHub repository.
3. Set the "Framework Preset" to "Other" and the "Root Directory" to \`packages/web-portal\`.
4. Click Deploy! Vercel will automatically update your site on every push. No GitHub Actions needed.`;
  } 
  else if (hosting === 'firebase') {
    fs.unlinkSync(path.join(targetDir, '.github/workflows/deploy-web-portal.yml'));
    
    const firebaseJson = `{
  "hosting": {
    "public": ".",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}`;
    fs.writeFileSync(path.join(targetDir, 'packages/web-portal/firebase.json'), firebaseJson);
    
    webWrapperUrlCode = "\`https://${projectSlug}.web.app/${IS_UAT ? '?env=uat' : ''}\`";
    hostingInstructions = `## 2. Firebase Hosting Setup
1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a project.
2. In your terminal, initialize GitHub Actions integration automatically:
   \`\`\`bash
   cd packages/web-portal
   yarn global add firebase-tools
   firebase login
   firebase init hosting:github
   \`\`\`
3. Follow the CLI prompts. The Firebase CLI will automatically create a Service Account, bind it to your GitHub repository via Secrets, and generate GitHub Actions workflow files.
4. **IMPORTANT**: Open the newly generated \`.github/workflows/firebase-hosting-*.yml\` files and:
   - Remove the \`- run: npm ci && npm run build\` step (since the portal is static).
   - Add \`entryPoint: packages/web-portal\` under the \`with:\` section of the \`FirebaseExtended/action-hosting-deploy\` step.`;
  }

  // Replace placeholders
  const replaceInFile = (filePath, replacements) => {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    for (const [key, val] of Object.entries(replacements)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      if (regex.test(content)) {
        content = content.replace(regex, val);
        changed = true;
      }
    }
    if (changed) fs.writeFileSync(filePath, content);
  };

  const replacements = {
    PROJECT_NAME: projectName,
    PROJECT_SLUG: projectSlug,
    OWNER_EMAIL: ownerEmail,
    BUNDLE_ID: bundleId,
    GITHUB_USER: githubUser,
    GITHUB_REPO: githubRepo,
    SCRIPT_ID_PROD: 'YOUR_PROD_SCRIPT_ID',
    SCRIPT_ID_UAT: 'YOUR_UAT_SCRIPT_ID',
    EAS_PROJECT_ID: 'YOUR_EAS_PROJECT_ID',
    WEB_WRAPPER_URL_CODE: webWrapperUrlCode,
    HOSTING_INSTRUCTIONS: hostingInstructions
  };

  const walk = (dir) => {
    fs.readdirSync(dir).forEach(file => {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        walk(fullPath);
      } else {
        replaceInFile(fullPath, replacements);
      }
    });
  };

  walk(targetDir);
  
  fs.renameSync(path.join(targetDir, 'SETUP.md'), path.join(targetDir, 'README.md'));

  console.log("\\n✅ Project generated successfully!");
  console.log(`Next steps:\\n  cd ../${projectSlug}\\n  cat README.md`);
}

run();
