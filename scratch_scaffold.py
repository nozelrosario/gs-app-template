import os
import textwrap

def create_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write(textwrap.dedent(content).strip() + '\n')

base_dir = '/sdcard/Projects/ancestralhomestay/gs-app-template/template'

# 1. Apps Script: Code.gs
code_gs = """
// ==============================================================================
// {{PROJECT_NAME}} - Backend & API
// ==============================================================================

const DEFAULT_OWNER_EMAIL = "{{OWNER_EMAIL}}";
const RECEIPT_FOLDER_NAME = "{{PROJECT_NAME}} Uploads";
var SESSION_EXPIRY_DAYS = 90;

function doGet(e) {
  var htmlOutput = HtmlService.createTemplateFromFile('Index').evaluate();
  htmlOutput.setTitle('{{PROJECT_NAME}}')
            .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
            .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return htmlOutput;
}

function doPost(e) {
  // Handle form submissions if needed
  return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.JSON);
}

// --- Authentication & Sessions ---
function getCurrentUserInfo(sessionToken) {
  if (!sessionToken) return { isAuthorized: false, isOwner: false };
  var session = validateSession(sessionToken);
  if (!session.valid) return { isAuthorized: false, isOwner: false };
  
  var email = session.email.toLowerCase().trim();
  var isOwner = (email === DEFAULT_OWNER_EMAIL.toLowerCase().trim());
  var isTeam = isEmailInTeam(email);
  
  if (isOwner || isTeam) {
    return { isAuthorized: true, isOwner: isOwner, email: email };
  }
  return { isAuthorized: false, isOwner: false, email: email };
}

function sendVerificationCode(userEmail) {
  var email = userEmail.toLowerCase().trim();
  var code = Math.floor(100000 + Math.random() * 900000).toString();
  var props = PropertiesService.getScriptProperties();
  props.setProperty('OTP_' + email, code);
  
  // Set expiry for 10 mins
  props.setProperty('OTP_EXP_' + email, (new Date().getTime() + 10*60000).toString());
  
  MailApp.sendEmail({
    to: email,
    subject: "{{PROJECT_NAME}} - Verification Code",
    htmlBody: "Your verification code is: <b>" + code + "</b><br><br>This code expires in 10 minutes."
  });
  return true;
}

function verifyEmailCode(userEmail, enteredCode) {
  var email = userEmail.toLowerCase().trim();
  var props = PropertiesService.getScriptProperties();
  var savedCode = props.getProperty('OTP_' + email);
  var expiry = props.getProperty('OTP_EXP_' + email);
  
  if (!savedCode || !expiry) return { success: false, message: "Code expired or invalid." };
  if (new Date().getTime() > parseInt(expiry)) return { success: false, message: "Code has expired." };
  
  if (savedCode === enteredCode.trim()) {
    props.deleteProperty('OTP_' + email);
    props.deleteProperty('OTP_EXP_' + email);
    var token = createSession(email);
    return { success: true, token: token };
  }
  return { success: false, message: "Incorrect code." };
}

function createSession(email) {
  setupDatabaseSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sessionSheet = ss.getSheetByName('_Sessions');
  
  var token = 'sess_' + Utilities.getUuid() + '_' + new Date().getTime();
  var now = new Date();
  var expires = new Date(now.getTime() + (SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000));
  
  sessionSheet.appendRow([token, email, now, expires, now]);
  return token;
}

function validateSession(token) {
  if (!token) return { valid: false };
  setupDatabaseSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('_Sessions');
  var data = sheet.getDataRange().getValues();
  
  var now = new Date();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      var expires = new Date(data[i][3]);
      if (now > expires) {
        return { valid: false }; // Expired
      }
      // Update last active
      sheet.getRange(i + 1, 5).setValue(now);
      return { valid: true, email: data[i][1] };
    }
  }
  return { valid: false };
}

function revokeSession(token) {
  if (!token) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('_Sessions');
  if(!sheet) return;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

// --- Database & Setup ---
function setupDatabaseSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var requiredSheets = ['Team', 'Settings', '_Sessions', 'Audit'];
  var sheetsCreated = false;
  
  requiredSheets.forEach(function(name) {
    if (!ss.getSheetByName(name)) {
      var newSheet = ss.insertSheet(name);
      if (name === '_Sessions') {
        newSheet.appendRow(['Token', 'Email', 'Created At', 'Expires At', 'Last Active']);
        newSheet.hideSheet();
      } else if (name === 'Audit') {
        newSheet.appendRow(['Audit ID', 'Timestamp', 'Action', 'User', 'Details']);
        newSheet.hideSheet();
      } else if (name === 'Team') {
        newSheet.appendRow(['Name', 'Emails (comma separated)', 'Role']);
      } else if (name === 'Settings') {
        newSheet.appendRow(['Key', 'Value']);
      }
      newSheet.getRange(1, 1, 1, newSheet.getMaxColumns()).setFontWeight('bold');
      newSheet.setFrozenRows(1);
      sheetsCreated = true;
    }
  });
  
  if (sheetsCreated) {
    seedDefaultLists(ss);
  }
}

function seedDefaultLists(ss) {
  var teamSheet = ss.getSheetByName('Team');
  if (teamSheet.getLastRow() === 1) {
    teamSheet.appendRow(['Admin User', DEFAULT_OWNER_EMAIL, 'Admin']);
  }
}

function isEmailInTeam(email) {
  setupDatabaseSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var teamSheet = ss.getSheetByName('Team');
  if(!teamSheet) return false;
  var data = teamSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var emails = data[i][1] ? data[i][1].toString().toLowerCase() : "";
    if (emails.indexOf(email) !== -1) return true;
  }
  return false;
}

function logAudit(action, user, details) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Audit');
  if (!sheet) return;
  sheet.appendRow([Utilities.getUuid(), new Date(), action, user, details]);
}
"""

code_gs_html = """
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>{{PROJECT_NAME}}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            primary: '#10b981', // emerald-500
          }
        }
      }
    }
  </script>
  <style>
    /* Prevent FOUC */
    html { display: none; }
    html.ready { display: block; }
    
    /* Hide scrollbar for tabs */
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  </style>
</head>
<body class="bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100 min-h-screen flex flex-col transition-colors duration-200">
  
  <!-- App Header -->
  <header class="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-40 hidden" id="appHeader">
    <div class="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
      <div class="font-bold text-lg text-primary truncate flex-1">
        {{PROJECT_NAME}}
      </div>
      <div class="flex items-center space-x-3">
        <!-- Theme Toggle -->
        <button onclick="toggleTheme()" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
          <svg id="themeIconLight" class="w-5 h-5 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
          <svg id="themeIconDark" class="w-5 h-5 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
        </button>
        <!-- User Badge -->
        <button onclick="openUserModal()" class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-medium shadow" id="userAvatarBtn">
          ?
        </button>
      </div>
    </div>
  </header>

  <!-- Main Content Container -->
  <main class="flex-1 max-w-4xl mx-auto w-full p-4 hidden" id="appMain">
    <!-- Dashboard View -->
    <div id="view-dashboard" class="space-y-4">
      <div class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 class="text-xl font-bold mb-2">Welcome!</h2>
        <p class="text-gray-600 dark:text-gray-400">Your application template is ready. Build amazing things.</p>
      </div>
    </div>
  </main>

  <!-- Auth Screen (OTP) -->
  <div id="authScreen" class="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col items-center justify-center p-4">
    <div class="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-100 dark:border-gray-700">
      <div class="text-center mb-8">
        <div class="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
        </div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">{{PROJECT_NAME}}</h2>
        <p class="text-sm text-gray-500 mt-2">Secure access via email verification</p>
      </div>
      
      <!-- Step 1: Email -->
      <div id="authStep1">
        <input type="email" id="authEmailInput" placeholder="Enter your email" class="w-full px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary focus:border-transparent outline-none mb-4">
        <button onclick="sendOtp()" id="btnSendOtp" class="w-full bg-primary hover:bg-emerald-600 text-white font-medium py-3 rounded-lg transition-colors">
          Send Verification Code
        </button>
      </div>

      <!-- Step 2: Code -->
      <div id="authStep2" class="hidden">
        <p class="text-sm text-center mb-4 text-gray-600 dark:text-gray-400">Code sent to <span id="lblSentEmail" class="font-medium text-gray-900 dark:text-white"></span></p>
        <input type="number" id="authCodeInput" placeholder="6-digit code" class="w-full px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary focus:border-transparent outline-none mb-4 text-center text-xl tracking-widest">
        <button onclick="verifyOtp()" id="btnVerifyOtp" class="w-full bg-primary hover:bg-emerald-600 text-white font-medium py-3 rounded-lg transition-colors">
          Verify & Login
        </button>
        <button onclick="resetAuth()" class="w-full mt-3 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          Cancel
        </button>
      </div>
      
      <div id="authErrorMsg" class="mt-4 text-center text-sm text-red-500 hidden"></div>
    </div>
  </div>

  <!-- Loading Overlay -->
  <div id="loadingOverlay" class="fixed inset-0 bg-white/80 dark:bg-gray-900/80 z-[100] flex flex-col items-center justify-center backdrop-blur-sm hidden">
    <div class="w-12 h-12 border-4 border-gray-200 border-t-primary rounded-full animate-spin"></div>
    <div id="loadingText" class="mt-4 text-sm font-medium text-gray-600 dark:text-gray-300">Loading...</div>
  </div>

  <!-- User Identity Modal -->
  <div id="userModal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 hidden opacity-0 transition-opacity">
    <div class="bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl shadow-xl overflow-hidden transform scale-95 transition-transform">
      <div class="p-6 text-center">
        <div class="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center text-2xl font-bold mx-auto mb-4" id="modalUserAvatar">?</div>
        <h3 class="text-lg font-bold text-gray-900 dark:text-white" id="modalUserEmail">user@example.com</h3>
        <p class="text-sm text-primary mt-1 font-medium" id="modalUserRole">Contributor</p>
      </div>
      <div class="border-t border-gray-100 dark:border-gray-700 p-2">
        <button onclick="logout()" class="w-full p-3 text-red-500 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex justify-center items-center">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
          Sign Out
        </button>
        <button onclick="closeUserModal()" class="w-full p-3 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors mt-1">
          Close
        </button>
      </div>
    </div>
  </div>

  <script>
    // --- State ---
    let appState = {
      user: null,
      token: localStorage.getItem('{{PROJECT_NAME}}_session_token') || null,
      theme: localStorage.getItem('theme') || 'system'
    };

    // --- Init ---
    function init() {
      applyTheme();
      document.documentElement.classList.add('ready');
      checkAuth();
    }

    // --- Theming ---
    function applyTheme() {
      const isDark = appState.theme === 'dark' || (appState.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (isDark) {
        document.documentElement.classList.add('dark');
        document.getElementById('themeIconLight').classList.add('hidden');
        document.getElementById('themeIconDark').classList.remove('hidden');
      } else {
        document.documentElement.classList.remove('dark');
        document.getElementById('themeIconDark').classList.add('hidden');
        document.getElementById('themeIconLight').classList.remove('hidden');
      }
    }

    function toggleTheme() {
      const isDark = document.documentElement.classList.contains('dark');
      appState.theme = isDark ? 'light' : 'dark';
      localStorage.setItem('theme', appState.theme);
      applyTheme();
    }

    // --- Auth & Session ---
    function checkAuth() {
      if (!appState.token) {
        showAuthScreen();
        return;
      }
      showLoading("Verifying session...");
      google.script.run
        .withSuccessHandler(function(res) {
          hideLoading();
          if (res.isAuthorized) {
            appState.user = res;
            updateUserUI();
            showApp();
          } else {
            handleLogoutClean();
            showAuthScreen();
            if(res.email) alert("Email " + res.email + " is not authorized. Ask Admin to add you.");
          }
        })
        .withFailureHandler(function(err) {
          hideLoading();
          showAuthScreen();
        })
        .getCurrentUserInfo(appState.token);
    }

    function sendOtp() {
      const email = document.getElementById('authEmailInput').value.trim();
      if (!email) return;
      const btn = document.getElementById('btnSendOtp');
      btn.disabled = true;
      btn.innerHTML = 'Sending...';
      document.getElementById('authErrorMsg').classList.add('hidden');
      
      google.script.run
        .withSuccessHandler(function(res) {
          document.getElementById('authStep1').classList.add('hidden');
          document.getElementById('authStep2').classList.remove('hidden');
          document.getElementById('lblSentEmail').innerText = email;
        })
        .withFailureHandler(function(err) {
          btn.disabled = false;
          btn.innerHTML = 'Send Verification Code';
          showAuthError("Failed to send code.");
        })
        .sendVerificationCode(email);
    }

    function verifyOtp() {
      const email = document.getElementById('authEmailInput').value.trim();
      const code = document.getElementById('authCodeInput').value.trim();
      if (!code) return;
      
      const btn = document.getElementById('btnVerifyOtp');
      btn.disabled = true;
      btn.innerHTML = 'Verifying...';
      document.getElementById('authErrorMsg').classList.add('hidden');
      
      google.script.run
        .withSuccessHandler(function(res) {
          if (res.success) {
            appState.token = res.token;
            localStorage.setItem('{{PROJECT_NAME}}_session_token', res.token);
            checkAuth();
          } else {
            btn.disabled = false;
            btn.innerHTML = 'Verify & Login';
            showAuthError(res.message);
          }
        })
        .withFailureHandler(function(err) {
          btn.disabled = false;
          btn.innerHTML = 'Verify & Login';
          showAuthError("Verification failed.");
        })
        .verifyEmailCode(email, code);
    }

    function logout() {
      closeUserModal();
      showLoading("Signing out...");
      google.script.run
        .withSuccessHandler(handleLogoutClean)
        .withFailureHandler(handleLogoutClean)
        .revokeSession(appState.token);
    }

    function handleLogoutClean() {
      hideLoading();
      appState.token = null;
      appState.user = null;
      localStorage.removeItem('{{PROJECT_NAME}}_session_token');
      resetAuth();
      showAuthScreen();
    }

    function resetAuth() {
      document.getElementById('authStep1').classList.remove('hidden');
      document.getElementById('authStep2').classList.add('hidden');
      document.getElementById('authEmailInput').value = '';
      document.getElementById('authCodeInput').value = '';
      document.getElementById('btnSendOtp').disabled = false;
      document.getElementById('btnSendOtp').innerHTML = 'Send Verification Code';
      document.getElementById('btnVerifyOtp').disabled = false;
      document.getElementById('btnVerifyOtp').innerHTML = 'Verify & Login';
      document.getElementById('authErrorMsg').classList.add('hidden');
    }

    // --- UI Helpers ---
    function showAuthScreen() {
      document.getElementById('authScreen').classList.remove('hidden');
      document.getElementById('appHeader').classList.add('hidden');
      document.getElementById('appMain').classList.add('hidden');
    }

    function showApp() {
      document.getElementById('authScreen').classList.add('hidden');
      document.getElementById('appHeader').classList.remove('hidden');
      document.getElementById('appMain').classList.remove('hidden');
    }

    function updateUserUI() {
      if (!appState.user) return;
      const initial = appState.user.email.charAt(0).toUpperCase();
      document.getElementById('userAvatarBtn').innerText = initial;
      document.getElementById('modalUserAvatar').innerText = initial;
      document.getElementById('modalUserEmail').innerText = appState.user.email;
      document.getElementById('modalUserRole').innerText = appState.user.isOwner ? "Admin / Owner" : "Team Member";
    }

    function showAuthError(msg) {
      const el = document.getElementById('authErrorMsg');
      el.innerText = msg;
      el.classList.remove('hidden');
    }

    function showLoading(text) {
      document.getElementById('loadingText').innerText = text || 'Loading...';
      document.getElementById('loadingOverlay').classList.remove('hidden');
    }

    function hideLoading() {
      document.getElementById('loadingOverlay').classList.add('hidden');
    }

    function openUserModal() {
      const modal = document.getElementById('userModal');
      modal.classList.remove('hidden');
      setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }

    function closeUserModal() {
      const modal = document.getElementById('userModal');
      modal.classList.add('opacity-0');
      setTimeout(() => modal.classList.add('hidden'), 300);
    }

    // Start
    window.addEventListener('DOMContentLoaded', init);
  </script>
</body>
</html>
"""

# Web Portal HTML
web_portal_html = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>{{PROJECT_NAME}}</title>
  <style>
    body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    iframe { width: 100%; height: 100%; border: none; }
    #loader { position: fixed; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #fff; z-index: 100; transition: opacity 0.5s; }
    .spinner { width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #10b981; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    
    /* UAT Bar */
    #uat-bar { display: none; height: 3px; background: #ea580c; position: fixed; top: 0; left: 0; right: 0; z-index: 999; }
    .is-uat #uat-bar { display: block; }
    .is-uat iframe { height: calc(100% - 3px); margin-top: 3px; }
    .is-uat .spinner { border-top-color: #ea580c; }
  </style>
</head>
<body>
  <div id="uat-bar"></div>
  <div id="loader">
    <div class="spinner"></div>
    <div style="margin-top: 16px; color: #6b7280; font-size: 14px;" id="load-text">Initializing {{PROJECT_NAME}}...</div>
  </div>
  <iframe id="app-frame" allow="camera; microphone; fullscreen; clipboard-read; clipboard-write"></iframe>

  <script>
    const ENDPOINTS = {
      prod: 'https://script.google.com/macros/s/{{SCRIPT_ID_PROD}}/exec',
      uat: 'https://script.google.com/macros/s/{{SCRIPT_ID_UAT}}/exec'
    };

    function init() {
      const urlParams = new URLSearchParams(window.location.search);
      const isUatPath = window.location.pathname.includes('/uat/');
      const isUatQuery = urlParams.get('env') === 'uat' || urlParams.get('env') === 'test';
      const isUAT = isUatPath || isUatQuery;

      if (isUAT) {
        document.body.classList.add('is-uat');
        document.getElementById('load-text').innerText = 'Initializing UAT Environment...';
        document.title = '{{PROJECT_NAME}} (UAT)';
      }

      const frame = document.getElementById('app-frame');
      const targetUrl = isUAT ? ENDPOINTS.uat : ENDPOINTS.prod;
      
      frame.onload = function() {
        const loader = document.getElementById('loader');
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 500);
      };
      
      frame.src = targetUrl;
    }

    init();
  </script>
</body>
</html>
"""

# App Shell App.js
app_js = """
import React, { useRef, useState, useEffect } from 'react';
import { StyleSheet, View, StatusBar, Platform, BackHandler, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';
import * as Network from 'expo-network';

export default function App() {
  const webviewRef = useRef(null);
  const [isConnected, setIsConnected] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);

  const IS_UAT = Constants.expoConfig.extra?.env === 'uat';
  // If hosted on GitHub Pages
  const BASE_URL = `https://{{GITHUB_USER}}.github.io/{{GITHUB_REPO}}/${IS_UAT ? 'uat/' : ''}`;

  useEffect(() => {
    checkNetwork();
    const backAction = () => {
      if (canGoBack && webviewRef.current) {
        webviewRef.current.goBack();
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [canGoBack]);

  const checkNetwork = async () => {
    const networkState = await Network.getNetworkStateAsync();
    setIsConnected(networkState.isConnected);
  };

  if (!isConnected) {
    return (
      <View style={styles.container}>
        <StatusBar style="auto" />
        <View style={styles.center}><ActivityIndicator size="large" color="#10b981" /></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle={IS_UAT ? 'light-content' : 'dark-content'} backgroundColor={IS_UAT ? '#ea580c' : '#ffffff'} />
      <WebView
        ref={webviewRef}
        source={{ uri: BASE_URL }}
        style={styles.webview}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        onNavigationStateChange={(navState) => setCanGoBack(navState.canGoBack)}
        startInLoadingState={true}
        renderLoading={() => <View style={[StyleSheet.absoluteFill, styles.center]}><ActivityIndicator size="large" color="#10b981" /></View>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  webview: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});
"""

app_config_js = """
module.exports = () => {
  const IS_UAT = process.env.APP_ENV === 'uat';

  return {
    expo: {
      name: IS_UAT ? "{{PROJECT_NAME}} (UAT)" : "{{PROJECT_NAME}}",
      slug: "{{PROJECT_SLUG}}",
      version: "1.0.0",
      orientation: "portrait",
      icon: "./assets/icon.png",
      userInterfaceStyle: "automatic",
      splash: {
        image: "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff"
      },
      ios: {
        supportsTablet: true,
        bundleIdentifier: IS_UAT ? "{{BUNDLE_ID}}.uat" : "{{BUNDLE_ID}}"
      },
      android: {
        adaptiveIcon: {
          foregroundImage: "./assets/adaptive-icon.png",
          backgroundColor: "#ffffff"
        },
        package: IS_UAT ? "{{BUNDLE_ID}}.uat" : "{{BUNDLE_ID}}"
      },
      web: {
        favicon: "./assets/favicon.png"
      },
      extra: {
        env: IS_UAT ? 'uat' : 'prod',
        eas: {
          projectId: "{{EAS_PROJECT_ID}}"
        }
      }
    }
  };
};
"""

# Script package.jsons and setup.md
setup_md = """
# {{PROJECT_NAME}} - Setup Guide

Welcome to your generated monorepo! This repository contains all three layers of your application.

## Directory Structure
- `packages/apps-script/`: Google Apps Script backend and HTML views.
- `packages/web-portal/`: GitHub Pages wrapper site.
- `packages/mobile-app/`: Expo React Native app shell.

## 1. Setup Google Apps Script
1. Go to [script.google.com](https://script.google.com) and create TWO projects (one for PROD, one for UAT).
2. For each project, copy the Script ID from Project Settings.
3. In this repo, update `packages/web-portal/index.html` with your new Script IDs.
4. Set up `clasp`:
   ```bash
   npm install -g @google/clasp
   clasp login
   ```
5. Push code to Apps Script:
   ```bash
   cd packages/apps-script
   clasp clone <YOUR_SCRIPT_ID>
   clasp push
   ```
6. Deploy each Apps Script as a Web App (Execute as: You, Access: Anyone).

## 2. GitHub Pages Setup
1. Go to your GitHub repository settings > Pages.
2. Ensure you have environments set up for `github-pages` allowing branches `main` and `develop`.
3. Pushes to `main` and `develop` will automatically build the composite site.

## 3. Expo Mobile App
```bash
cd packages/mobile-app
npm install
npm start
```
"""

kickstart_js = """
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
  
  rl.close();

  const targetDir = path.join(__dirname, '..', '..', projectSlug);
  if (fs.existsSync(targetDir)) {
    console.error(`Error: Directory ${targetDir} already exists.`);
    process.exit(1);
  }

  console.log(`\\nGenerating project in ${targetDir}...`);
  fs.cpSync(path.join(__dirname, 'template'), targetDir, { recursive: true });

  // Replace placeholders
  const replaceInFile = (filePath, replacements) => {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    for (const [key, val] of Object.entries(replacements)) {
      content = content.replace(new RegExp(`{{${key}}}`, 'g'), val);
    }
    fs.writeFileSync(filePath, content);
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
    EAS_PROJECT_ID: 'YOUR_EAS_PROJECT_ID'
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
"""

# Write files
create_file(os.path.join(base_dir, 'packages/apps-script/Code.gs'), code_gs)
create_file(os.path.join(base_dir, 'packages/apps-script/Index.html'), code_gs_html)
create_file(os.path.join(base_dir, 'packages/web-portal/index.html'), web_portal_html)
create_file(os.path.join(base_dir, 'packages/mobile-app/App.js'), app_js)
create_file(os.path.join(base_dir, 'packages/mobile-app/app.config.js'), app_config_js)
create_file(os.path.join(base_dir, 'SETUP.md'), setup_md)
create_file(os.path.join(base_dir, '../kickstart.js'), kickstart_js)

print("Template files created successfully.")
