# GS-App-Template Kick-Starter

This folder contains a single-project generator that scaffolds a complete 3-tier architecture using Google Apps Script, GitHub Pages, and Expo React Native. 

All generated apps come pre-configured with:
- Secure passwordless email OTP authentication.
- Google Sheets serverless database handlers.
- Tailwind CSS responsive dark/light mode UI.
- GitHub Actions for CI/CD across all 3 tiers.

## Example Project Generation Walkthrough

Here is a complete walkthrough of what the project generation process looks like from start to finish.

### 1. Running the Generator
Navigate to this template folder and run the interactive script. It will ask you a series of configuration questions. You can press `Enter` to accept the default values shown in the brackets `[]`.

```bash
cd /sdcard/Projects/ancestralhomestay/gs-app-template
node kickstart.js
```

**Interactive Output:**
```text
🚀 Welcome to the GS App Template Kickstarter!

Project Name [My App]: Smart Home Hub
Project Slug [smart-home-hub]: 
Owner Email [admin@example.com]: admin@mycompany.com
App Bundle ID [com.example.myapp]: com.mycompany.smarthome
GitHub Username/Org [myorg]: theancestralhomestay
GitHub Repository Name [smart-home-hub]: 
Web Hosting Provider (github-pages, vercel, firebase) [github-pages]: firebase

Generating project in /sdcard/Projects/ancestralhomestay/smart-home-hub...

✅ Project generated successfully!
Next steps:
  cd ../smart-home-hub
  cat README.md
```

### 2. Exploring the Generated Project
If you navigate to the newly created folder, you will see your new monorepo is ready. It is completely decoupled from the template, and all variables (`{{PROJECT_NAME}}`, `{{BUNDLE_ID}}`, etc.) have been dynamically replaced in the code:

```text
smart-home-hub/
├── .github/
│   └── workflows/
│       ├── build-mobile-app.yml       # Scoped to /packages/mobile-app/**
│       ├── deploy-apps-script.yml     # Scoped to /packages/apps-script/**
│       └── deploy-web-portal.yml      # Scoped to /packages/web-portal/**
├── packages/
│   ├── apps-script/
│   │   ├── Code.gs                    # Backend & Auth logic
│   │   ├── Index.html                 # UI, Modals, Settings Dashboard
│   │   ├── appsscript.json            # Google Apps Script manifest
│   │   └── package.json               
│   ├── mobile-app/
│   │   ├── App.js                     # React Native WebView
│   │   ├── app.config.js              # Environment switcher (PROD/UAT)
│   │   └── package.json               
│   └── web-portal/
│       └── index.html                 # Wrapper iframe with UAT banner
└── README.md                          # (Formerly SETUP.md) Contains setup steps
```

### 3. First-Time Setup
Once generated, follow the instructions in the newly created `README.md` to bring the 3 layers to life:

**A. Deploying the Apps Script Backend:**
1. Go to `script.google.com` and create two new scripts (one for PROD, one for UAT).
2. Grab the PROD Script ID from Project Settings.
3. Link the code and push it to Google:
```bash
cd smart-home-hub/packages/apps-script
npm install -g @google/clasp

# Login to Google (only needed once)
clasp login

# Link this folder to your PROD script
clasp clone YOUR_PROD_SCRIPT_ID

# Push the generic backend/UI code to Google
clasp push
```
4. Deploy the script as a Web App from the Google UI (Execute as: You, Access: Anyone).

**B. Configuring the Web Wrapper:**
Open `smart-home-hub/packages/web-portal/index.html` and paste in your Web App URLs:
```javascript
const ENDPOINTS = {
  prod: 'https://script.google.com/macros/s/YOUR_PROD_SCRIPT_ID/exec',
  uat: 'https://script.google.com/macros/s/YOUR_UAT_SCRIPT_ID/exec'
};
```
Follow the specific web hosting setup instructions (GitHub Pages, Vercel, or Firebase) generated in your new project's `README.md` to deploy your portal.

**C. Starting the Mobile App:**
1. Log in to [Expo](https://expo.dev) and run `eas init --id YOUR_EAS_PROJECT_ID` inside the `packages/mobile-app` folder.
2. Add your `EXPO_TOKEN` to your GitHub secrets for automated EAS cloud builds.
3. Run the app locally to test the wrapper:
```bash
cd smart-home-hub/packages/mobile-app
npm install

# Start the dev server in Production mode
npm start

# Or start it in UAT mode so it loads the UAT environment URL and styling
APP_ENV=uat npm start
```

## Documentation Reference
See `docs/base_features.md` for a full breakdown of the generic architectural features extracted from the base applications.

---

## 🌐 Web Hosting Options

Depending on the Web Hosting Provider you select during generation, the `README.md` of your new project will contain specific deployment instructions. Here is how each option works under the hood:

### 1. GitHub Pages (Public Repositories Only)
*   **Workflow:** The generator creates a `.github/workflows/deploy-web-portal.yml` file.
*   **How it works:** This GitHub Action takes the code from `main` (for production) and `develop` (for UAT) and merges them into a single GitHub Pages composite site (e.g. `your-repo.github.io/` and `your-repo.github.io/uat/`).
*   **Setup:** You only need to enable "GitHub Pages" in your repository settings.

### 2. Vercel (Supports Private Repositories)
*   **Workflow:** The generator **deletes** the GitHub Actions workflow file because Vercel handles CI/CD natively.
*   **How it works:** Vercel automatically watches your GitHub repository and triggers builds on every commit. It is a 100% serverless, zero-config static host.
*   **Setup:** Go to Vercel.com, import your GitHub repo, and point the root directory to `packages/web-portal`. 

### 3. Firebase Hosting (Supports Private Repos & Google Ecosystem)
*   **Workflow:** The generator creates `firebase.json` routing configurations but deletes the manual GitHub Actions file.
*   **How it works:** We rely on the official Firebase CLI to automate the entire CI/CD integration. Firebase Hosting is fast, secure, and permanently free for commercial apps.
*   **Setup:** Open your terminal inside `packages/web-portal` and run `firebase init hosting:github`. The Firebase CLI will automatically authenticate, provision a secure Google Cloud Service Account, inject the secret keys into your GitHub repo, and generate a modern, official GitHub Actions workflow file automatically!
