# Base Features for GS-App-Template

This document outlines the generic, reusable features extracted from the 3-tier architecture (Google Apps Script + GitHub Pages + Expo App Shell). These features will form the foundation of the kickstarter scaffolding script.

## 1. Authentication & Security (Apps Script Backend)
*   **Passwordless Email OTP:** User authentication using 6-digit codes sent via email.
*   **Session Management:** Secure 90-day tokens with auto-expiry, last-active tracking, and sign-out capabilities. Persistent session state using local storage and Google Sheets.
*   **Role-Based Access Control (RBAC):** 
    *   **Admin/Owner:** Full access to all features, system settings, and user management.
    *   **Contributor/User:** Access restricted to basic operations, limited by admin.
*   **Unauthorized Routing Guard:** Blocks unauthenticated users and seamlessly redirects to the OTP verification screen.

## 2. Data & Storage Management (Apps Script Backend)
*   **Google Sheets Database (Serverless CRUD):** Robust handlers for Create, Read, Update, and Delete operations using Google Sheets as a database.
*   **Automated Master Data Seeding:** Auto-creation of essential sheets, tables, and default seed data on the first deployment.
*   **Audit Logging System:** A hidden, immutable audit trail tracking all data mutations (capturing old vs. new values, editor email, and timestamps).
*   **Drive File Integration:** File/image upload handling directly to designated Google Drive folders, returning viewable public links.
*   **Data Export:** Built-in capabilities to export table data (e.g., CSV downloads).

## 3. Frontend UI/UX (HTML/JS + Tailwind CSS)
*   **Single Page Application (SPA) Architecture:** Client-side routing and tab navigation without page reloads using Vanilla JavaScript.
*   **Responsive Mobile-First Design:** Styled with Tailwind CSS to ensure it looks professional on both mobile devices and desktops.
*   **Theming & Dark Mode:** Built-in dark/light mode toggle. User preference is saved in local storage to prevent Flash of Unstyled Content (FOUC).
*   **Component Kit:** Ready-to-use structural elements:
    *   Dynamic Header with User Badge & Menu.
    *   Reusable Modals (Forms, Confirmation dialogs).
    *   Form validation UI.
    *   Loading spinners and Toast/Alert notifications.
*   **Settings Dashboard:** Standard admin interface to manage users, configure dropdown lists, and modify app behavior.

## 4. Web Portal Wrapper (Static Hosting)
*   **Iframe Embedding:** A lightweight shell that embeds the Google Apps Script web app, masking the long Google URL and allowing custom domain usage.
*   **Environment Detection (PROD vs UAT):** Auto-detects the environment based on URL path (e.g., `/uat/`) or query parameters (`?env=uat`) and displays visual indicators (e.g., UAT badges, colored headers).
*   **Hosting Agnostic:** Ready to be deployed to GitHub Pages, Vercel, or Firebase Hosting depending on user preference and privacy needs.

## 5. Mobile App Shell (Expo React Native)
*   **Native WebView:** Wraps the web portal to generate standalone iOS and Android applications.
*   **Dynamic App Variants:** Uses `app.config.js` to create distinct app versions (Production vs UAT) with different bundle identifiers, names, and icons.
*   **Native Integrations:** Handles pull-to-refresh, camera/gallery permissions for file uploads, and session cookie persistence.
*   **Offline Handling:** Network state detection displaying custom offline fallback screens when internet is unavailable.

## 6. DevOps & CI/CD Pipelines (GitHub Actions)
*   **Dual-Environment Strategy:** Strict separation of Production (`main` branch) and UAT/Sandbox (`develop` branch) across all components.
*   **Apps Script Automations (`clasp`):** GitHub Actions workflows to auto-deploy `.gs` and `.html` files to Google's servers.
*   **Dynamic Web Deployments:** Conditionally generated workflows for GitHub Pages (composite deployment) or Firebase (using official CLI automation). Vercel relies on native integrations without Actions.
*   **Mobile Build Automation:** Workflows for EAS (Expo Application Services) Cloud builds triggered by branch pushes.

## 7. Required Customization Parameters (For the Scaffolding Script)
To generate a new project, the kickstarter script will prompt the user for:
*   **Project Name & Description**
*   **Admin/Owner Email**
*   **Google Drive Folder Name** (for uploads)
*   **GitHub Repository Names** (or assume a monorepo approach)
*   **Google Apps Script IDs** (for PROD and UAT environments)
*   **Expo Bundle Identifiers** (e.g., `com.mycompany.app`)
*   **Theme Preferences** (Primary color hex codes)
