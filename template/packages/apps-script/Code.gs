/**
 * ==============================================================================
 * {{PROJECT_NAME}} - Backend - GOOGLE APPS SCRIPT (Code.gs)
 * ==============================================================================
 * Web App Backend logic for backend services,
 * team reimbursements, cash advances, and automated receipt uploads to Google Drive.
 * Backed by Google Sheets database.
 */

// Global Folder Name for Receipt Storage
const RECEIPT_FOLDER_NAME = "{{PROJECT_NAME}} Uploads";
const DEFAULT_OWNER_EMAIL = "{{OWNER_EMAIL}}";

/**
 * Serves the HTML Web App UI on GET request
 */
function doGet() {
  var template;
  try {
    template = HtmlService.createTemplateFromFile('Index');
  } catch (e1) {
    try {
      template = HtmlService.createTemplateFromFile('index');
    } catch (e2) {
      return HtmlService.createHtmlOutput("<h3>Error loading UI</h3><p>Could not find 'Index.html' in your Apps Script project. Please create an HTML file named <b>Index</b> (or <b>index</b>) and paste the Index.html source code into it.</p>");
    }
  }

  // Detect active user and effective user from Google Session
  var activeUser = "";
  var effectiveUser = "";
  try { activeUser = Session.getActiveUser().getEmail(); } catch (e) {}
  try { effectiveUser = Session.getEffectiveUser().getEmail(); } catch (e) {}

  var ownerEmail = (effectiveUser && effectiveUser.trim() !== "") ? effectiveUser.trim() : DEFAULT_OWNER_EMAIL;

  template.activeEmail = activeUser || '';
  template.ownerEmail = ownerEmail;
  
  // App Owner check: activeUser is owner if matches effectiveUser or DEFAULT_OWNER_EMAIL
  var isOwner = false;
  if (activeUser && activeUser.trim() !== "") {
    var aClean = activeUser.toLowerCase().trim();
    if (aClean === ownerEmail.toLowerCase().trim() || aClean === DEFAULT_OWNER_EMAIL.toLowerCase().trim()) {
      isOwner = true;
    }
  }
  template.isOwner = isOwner ? 'true' : 'false';

  return template.evaluate()
    .setTitle('{{PROJECT_NAME}} - Operations & Settlement')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * SESSION MANAGEMENT CONFIGURATION & HELPERS
 * Session tokens are stored in a hidden '_Sessions' sheet in the Google Spreadsheet.
 * Expiry: 90 days (configurable). Expired entries are pruned automatically.
 */
var SESSION_EXPIRY_DAYS = 90;

function getOrCreateSessionsSheet(ss) {
  if (!ss) return null;
  var sheet = ss.getSheetByName("_Sessions");
  if (!sheet) {
    sheet = ss.insertSheet("_Sessions");
    sheet.appendRow(["Session Token", "Email", "Created At", "Expires At", "Last Active"]);
    sheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#f3f4f6");
    try {
      sheet.hideSheet();
    } catch (e) {}
  }
  return sheet;
}

function pruneExpiredSessions(sheet) {
  if (!sheet) return;
  try {
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    var now = new Date().getTime();
    for (var i = data.length - 1; i >= 0; i--) {
      var row = data[i];
      var expiresAt = new Date(row[3]).getTime();
      if (isNaN(expiresAt) || expiresAt < now) {
        sheet.deleteRow(i + 2);
      }
    }
  } catch (e) {
    console.error("Error pruning sessions: " + e);
  }
}

function createSession(userEmail) {
  try {
    userEmail = String(userEmail).toLowerCase().trim();
    var ss = getSpreadsheet();
    var sheet = getOrCreateSessionsSheet(ss);
    if (!sheet) return null;

    pruneExpiredSessions(sheet);

    var randomUuid = Utilities.getUuid().replace(/-/g, '');
    var token = "vfm_sess_" + randomUuid + "_" + new Date().getTime();
    var now = new Date();
    var expiresAt = new Date(now.getTime() + (SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000));

    sheet.appendRow([token, userEmail, now.toISOString(), expiresAt.toISOString(), now.toISOString()]);
    return token;
  } catch (e) {
    console.error("Error creating session: " + e);
    return null;
  }
}

function validateSession(token) {
  if (!token || typeof token !== 'string' || token.indexOf('vfm_sess_') !== 0) {
    return null;
  }
  try {
    var ss = getSpreadsheet();
    var sheet = getOrCreateSessionsSheet(ss);
    if (!sheet) return null;

    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return null;

    var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    var now = new Date().getTime();

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var rowToken = String(row[0]).trim();
      if (rowToken === token.trim()) {
        var expiresAt = new Date(row[3]).getTime();
        if (!isNaN(expiresAt) && expiresAt > now) {
          try {
            sheet.getRange(i + 2, 5).setValue(new Date().toISOString());
          } catch (e) {}
          return String(row[1]).toLowerCase().trim();
        } else {
          try { sheet.deleteRow(i + 2); } catch (e) {}
          return null;
        }
      }
    }
  } catch (e) {
    console.error("Error validating session: " + e);
  }
  return null;
}

function revokeSession(token) {
  if (!token) return { status: 'success' };
  try {
    var ss = getSpreadsheet();
    var sheet = getOrCreateSessionsSheet(ss);
    if (!sheet) return { status: 'success' };

    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { status: 'success' };

    var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(token).trim()) {
        sheet.deleteRow(i + 2);
        break;
      }
    }
  } catch (e) {}
  return { status: 'success' };
}

/**
 * Gets current session user info and evaluates authorization against Owner & Team Emails.
 * Supports:
 * 1. Native Session.getActiveUser().getEmail()
 * 2. 90-day Session Token stored in _Sessions sheet (from OTP verification)
 */
function getCurrentUserInfo(sessionToken) {
  var activeUser = "";
  var effectiveUser = "";
  try { activeUser = Session.getActiveUser().getEmail(); } catch (e) {}
  try { effectiveUser = Session.getEffectiveUser().getEmail(); } catch (e) {}
  
  var verifiedEmail = "";
  if (sessionToken) {
    var inputStr = String(sessionToken).trim();
    if (inputStr.indexOf('vfm_sess_') === 0) {
      var sessionEmail = validateSession(inputStr);
      if (sessionEmail) {
        verifiedEmail = sessionEmail;
      }
    }
  }

  var ownerEmail = (effectiveUser && effectiveUser.trim() !== "") ? effectiveUser.trim() : DEFAULT_OWNER_EMAIL;

  var isOwner = false;
  if (verifiedEmail && verifiedEmail.trim() !== "") {
    var vClean = verifiedEmail.toLowerCase().trim();
    if (vClean === ownerEmail.toLowerCase().trim() || vClean === DEFAULT_OWNER_EMAIL.toLowerCase().trim()) {
      isOwner = true;
    }
  }

  var ss = getSpreadsheet();
  var teamEmails = ss ? getTeamEmailsMap(ss) : {};
  var matchedMemberName = "";

  if (verifiedEmail) {
    var vEmailLower = verifiedEmail.toLowerCase().trim();
    for (var mName in teamEmails) {
      var eList = teamEmails[mName] || [];
      for (var i = 0; i < eList.length; i++) {
        var eItem = eList[i] ? String(eList[i]).toLowerCase().trim() : '';
        if (eItem && eItem === vEmailLower) {
          matchedMemberName = mName;
          break;
        }
      }
      if (matchedMemberName) break;
    }
  }

    if (isOwner && !matchedMemberName) {
    matchedMemberName = 'Admin';
  }

  var isAuthorized = isOwner || Boolean(matchedMemberName);

  // Resolve user role: admin bypasses all checks, otherwise look up from Team sheet
  var userRole = 'editor'; // default
  if (isOwner) {
    userRole = 'admin';
  } else if (matchedMemberName && ss) {
    var teamRoles = getTeamRolesMap(ss);
    var currentEmail = verifiedEmail || activeUser || '';
    userRole = teamRoles[currentEmail] || 'editor';
  }

  return {
    activeEmail: verifiedEmail || activeUser || '',
    ownerEmail: ownerEmail,
    isOwner: isOwner,
    isAdmin: isOwner,
    isAuthorized: isAuthorized,
    matchedMemberName: matchedMemberName,
    teamEmails: teamEmails,
    userRole: userRole
  };
}

/**
 * RUN THIS ONCE in Google Apps Script Editor to authorize email sending!
 * Select 'authorizeEmailPermission' from the top dropdown toolbar -> click Run -> click Review Permissions -> Allow.
 */
function authorizeEmailPermission() {
  var user = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || DEFAULT_OWNER_EMAIL;
  MailApp.sendEmail(user, "Villa Manager Mail Permission Test", "MailApp authorization completed successfully!");
  Logger.log("MailApp permission authorized successfully!");
}

/**
 * Sends a 6-digit verification code to the specified email address via MailApp
 */
function sendVerificationCode(userEmail) {
  try {
    if (!userEmail || userEmail.indexOf('@') === -1) {
      return { status: 'error', message: 'Please enter a valid email address.' };
    }
    userEmail = String(userEmail).toLowerCase().trim();
    var code = Math.floor(100000 + Math.random() * 900000).toString();
    
    var props = PropertiesService.getScriptProperties();
    var codeKey = 'OTP_' + userEmail;
    var data = { code: code, expires: new Date().getTime() + (10 * 60 * 1000) }; // 10 mins
    props.setProperty(codeKey, JSON.stringify(data));
    
    var subject = "{{PROJECT_NAME}} - Verification Code: " + code;
    var body = "Hello,\n\nYour 6-digit verification code for {{PROJECT_NAME}} Operations Manager is:\n\n" + code + "\n\nThis code will expire in 10 minutes.\n\nThank you.";
    
    try {
      MailApp.sendEmail(userEmail, subject, body);
    } catch (mailErr) {
      try {
        GmailApp.sendEmail(userEmail, subject, body);
      } catch (gmailErr) {
        throw mailErr;
      }
    }
    return { status: 'success', message: 'Verification code sent to ' + userEmail + '! Check your inbox or spam folder.' };
  } catch (e) {
    var errStr = e.toString();
    if (errStr.indexOf('permission') !== -1 || errStr.indexOf('send_mail') !== -1 || errStr.indexOf('MailApp') !== -1) {
      return { 
        status: 'error', 
        message: '⚠️ One-Time Mail Permission Required: The Villa Owner needs to open the Google Apps Script editor, select "authorizeEmailPermission" from the top dropdown toolbar, click "Run", and click "Allow". Once authorized, emails will send automatically for everyone!' 
      };
    }
    return { status: 'error', message: 'Failed to send email: ' + errStr };
  }
}

/**
 * Verifies the 6-digit verification code entered by the user
 */
function verifyEmailCode(userEmail, enteredCode) {
  try {
    if (!userEmail || !enteredCode) {
      return { status: 'error', message: 'Email and verification code are required.' };
    }
    userEmail = String(userEmail).toLowerCase().trim();
    enteredCode = String(enteredCode).trim();
    
    var props = PropertiesService.getScriptProperties();
    var codeKey = 'OTP_' + userEmail;
    var raw = props.getProperty(codeKey);
    if (!raw) {
      return { status: 'error', message: 'No active code found for this email. Please request a new code.' };
    }
    var data = JSON.parse(raw);
    if (new Date().getTime() > data.expires) {
      props.deleteProperty(codeKey);
      return { status: 'error', message: 'Code expired. Please request a new code.' };
    }
    if (data.code !== enteredCode) {
      return { status: 'error', message: 'Invalid code. Please check and try again.' };
    }
    
    // Success: Delete code and issue 90-day session token stored in Google Sheet _Sessions tab
    props.deleteProperty(codeKey);
    var sessionToken = createSession(userEmail);

    // Get full user info (including role) using the new session
    var userInfo = getCurrentUserInfo(sessionToken);
    var isOwner = userInfo.isOwner;

    return {
      status: 'success',
      email: userEmail,
      sessionToken: sessionToken,
      isOwner: isOwner,
      isAdmin: isOwner,
      userRole: userInfo.userRole || 'editor',
      message: 'Email verified successfully! ' + (isOwner ? '👑 App Owner Admin Mode Activated!' : 'Active session granted for 90 days.')
    };
  } catch (e) {
    return { status: 'error', message: 'Verification error: ' + e.toString() };
  }
}

/**
 * Spreadsheet getter: returns container-bound spreadsheet or opened by saved SPREADSHEET_ID
 */
function getSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;

  var props = PropertiesService.getScriptProperties();
  var savedId = props.getProperty('SPREADSHEET_ID');
  if (savedId) {
    try {
      var opened = SpreadsheetApp.openById(savedId);
      if (opened) return opened;
    } catch (err) {}
  }

  try {
    var newSs = SpreadsheetApp.create('{{PROJECT_NAME}} Database');
    props.setProperty('SPREADSHEET_ID', newSs.getId());
    return newSs;
  } catch (err) {
    return null;
  }
}

/**
 * Ensures required database tabs exist in the Spreadsheet
 */
function setupDatabaseSheets() {
  var ss = getSpreadsheet();
  if (!ss) return;
  
  var sheets = {
    'Team': ['Member Name', 'Google Account Emails', 'Role'],
    'Settings': ['Setting Key', 'Setting Value'],
    'Audit': ['Audit ID', 'Timestamp', 'Action', 'User', 'Details']
  };

  for (var name in sheets) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, sheets[name].length).setValues([sheets[name]]);
      sheet.getRange(1, 1, 1, sheets[name].length).setFontWeight("bold").setBackground("#f3f4f6");
      sheet.setFrozenRows(1);
    }
  }

  seedDefaultLists(ss);
}

function seedDefaultLists(ss) {
  var teamSheet = ss.getSheetByName('Team');
  if (teamSheet.getLastRow() <= 1) {
    teamSheet.getRange(2, 1, 1, 3).setValues([
      ['Admin', '{{OWNER_EMAIL}}', 'admin']
    ]);
  }
}

function getTeamEmailsMap(ss) {
  var sheet = ss.getSheetByName('Team');
  if (!sheet) return {};
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return {};
  var lastCol = sheet.getLastColumn();

  var map = {};
  if (lastCol < 2) {
    var namesOnly = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var k = 0; k < namesOnly.length; k++) {
      var nm = String(namesOnly[k][0] || '').trim();
      if (nm) map[nm] = [];
    }
    return map;
  }

  var range = sheet.getRange(2, 1, lastRow - 1, 2);
  var values = range.getValues();
  for (var i = 0; i < values.length; i++) {
    var name = String(values[i][0] || '').trim();
    var emailsRaw = String(values[i][1] || '').trim();
    if (name) {
      var emailList = emailsRaw ? emailsRaw.split(',').map(function(e) { return String(e).trim(); }).filter(Boolean) : [];
      map[name] = emailList;
    }
  }
  return map;
}

/**
 * Helper to get mapping of member names to their roles (editor/readonly)
 */
function getTeamRolesMap(ss) {
  var sheet = ss.getSheetByName('Team');
  if (!sheet) return {};
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return {};
  var lastCol = sheet.getLastColumn();

  var map = {};
  
  var numCols = lastCol < 3 ? 2 : 3;
  var range = sheet.getRange(2, 1, lastRow - 1, numCols);
  var values = range.getValues();
  
  for (var i = 0; i < values.length; i++) {
    var name = String(values[i][0] || '').trim();
    var emailsRaw = String(values[i][1] || '').trim();
    var rolesRaw = numCols === 3 ? String(values[i][2] || '').toLowerCase().trim() : 'editor';
    
    if (name && emailsRaw) {
      var emailList = emailsRaw.split(',').map(function(e) { return String(e).trim(); }).filter(Boolean);
      var roleList = rolesRaw.split(',').map(function(r) { return String(r).trim(); }).filter(Boolean);
      
      for (var j = 0; j < emailList.length; j++) {
        var email = emailList[j];
        var role = roleList[j] || roleList[0] || 'editor'; // default to matching index, or first role, or editor
        map[email] = (role === 'readonly') ? 'readonly' : 'editor';
      }
    }
  }
  return map;
}

/**
 * Helper to get a flat map of all emails across all team members for uniqueness checks
 * Returns: { 'email@example.com': 'MemberName', ... }
 */
function getAllTeamEmailsFlat(ss) {
  var teamEmails = getTeamEmailsMap(ss);
  var flat = {};
  for (var member in teamEmails) {
    var emails = teamEmails[member] || [];
    for (var i = 0; i < emails.length; i++) {
      var e = String(emails[i]).toLowerCase().trim();
      if (e) flat[e] = member;
    }
  }
  return flat;
}

/**
 * Checks if the user identified by sessionToken has write access.
 * Returns { allowed: true, userInfo } or { allowed: false, message }
 * Admin always has write access. Readonly users are denied.
 */
function assertWriteAccess(sessionToken) {
  var userInfo = getCurrentUserInfo(sessionToken);
  if (!userInfo.isAuthorized) {
    return { allowed: false, message: 'Unauthorized: You must be an authorized team member or admin.' };
  }
  if (userInfo.userRole === 'readonly') {
    return { allowed: false, message: 'Access denied: Your account has read-only access. Contact the admin to upgrade your role.' };
  }
  return { allowed: true, userInfo: userInfo };
}

/**
 * Updates or adds Google Emails (and optionally Role) for a Team Member
 */
function updateTeamMemberEmails(memberName, emailsRaw, rolesRaw) {
  try {
    setupDatabaseSheets();
    var ss = getSpreadsheet();
    if (!ss) return { status: 'error', message: 'Spreadsheet database not found' };
    var sheet = ss.getSheetByName('Team');
    if (!sheet) return { status: 'error', message: 'Team sheet not found' };

    // Validate email uniqueness across all team members
    var proposedEmails = emailsRaw ? emailsRaw.split(',').map(function(e) { return String(e).trim().toLowerCase(); }).filter(Boolean) : [];
    if (proposedEmails.length > 0) {
      // Check for duplicates within the proposed list itself
      var seen = {};
      for (var d = 0; d < proposedEmails.length; d++) {
        if (seen[proposedEmails[d]]) {
          return { status: 'error', message: 'Duplicate email detected: "' + proposedEmails[d] + '" appears more than once in the email list.' };
        }
        seen[proposedEmails[d]] = true;
      }

      // Check against other members' emails
      var allFlat = getAllTeamEmailsFlat(ss);
      for (var p = 0; p < proposedEmails.length; p++) {
        var pe = proposedEmails[p];
        if (allFlat[pe] && allFlat[pe].toLowerCase() !== String(memberName).trim().toLowerCase()) {
          return { status: 'error', message: 'Email "' + pe + '" is already assigned to team member "' + allFlat[pe] + '". Emails must be unique across all members.' };
        }
      }
    }

    // Normalize role values (store exactly as passed, filtering blanks, comma separated)
    var rolesList = rolesRaw ? String(rolesRaw).split(',').map(function(r) { 
      return String(r).toLowerCase().trim() === 'readonly' ? 'readonly' : 'editor'; 
    }) : [];
    var finalRolesStr = rolesList.join(', ');

    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim().toLowerCase() === String(memberName).trim().toLowerCase()) {
          sheet.getRange(i + 2, 2).setValue(emailsRaw);
          sheet.getRange(i + 2, 3).setValue(finalRolesStr);
          return { status: 'success', message: 'Updated Google email(s) and role for ' + memberName };
        }
      }
    }
    sheet.appendRow([memberName.trim(), emailsRaw, finalRolesStr]);
    return { status: 'success', message: 'Added and updated Google email(s) for ' + memberName };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Fetches dynamic dropdown options and live financial summaries for the UI
 */
function getFormData(targetBookId, idToken) {
  try {
    setupDatabaseSheets();
    var ss = getSpreadsheet();
    if (!ss) return { status: 'error', message: 'Could not access database spreadsheet.' };
    
    var userInfo = getCurrentUserInfo(idToken);

    if (!userInfo.isAuthorized) {
      return {
        status: 'success',
        isAuthorized: false,
        activeEmail: userInfo.activeEmail,
        ownerEmail: userInfo.ownerEmail,
        isOwner: userInfo.isOwner,
        isAdmin: userInfo.isAdmin,
        userRole: userInfo.userRole,
        team: [],
        teamEmails: {},
        teamRoles: {}
      };
    }

    var teamSheet = ss.getSheetByName('Team');
    var teamData = teamSheet ? teamSheet.getDataRange().getValues() : [];
    var team = [];
    var numCols = teamSheet ? teamSheet.getLastColumn() : 1;
    for (var i = 1; i < teamData.length; i++) {
      if (teamData[i][0]) {
        team.push(String(teamData[i][0]).trim());
      }
    }

    var teamEmailsMap = getTeamEmailsMap(ss);
    var teamRolesMap = getTeamRolesMap(ss);

    return {
      status: 'success',
      isAuthorized: true,
      activeEmail: userInfo.activeEmail,
      ownerEmail: userInfo.ownerEmail,
      isOwner: userInfo.isOwner,
      isAdmin: userInfo.isAdmin,
      userRole: userInfo.userRole,
      team: team,
      teamEmails: teamEmailsMap,
      teamRoles: teamRolesMap
    };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}