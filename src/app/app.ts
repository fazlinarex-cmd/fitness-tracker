import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIf, NgFor, DatePipe } from '@angular/common';
import { signUpUser, signInUser, signOutUser, recordSession, recordMultipleSessions, requestAdminAccess, getAllUsers, getUserSessions, setAdminFlag, onAuthStateChange, getUserById, getAllSessions, getAllSessionsPaged, updateSession, deleteSession, getSessionById } from './firebase.service';
import { ADMIN_EMAIL, ADMIN_SECRET, SHOW_DEV_ADMIN } from './enviroments/enviroment';
import * as XLSX from 'xlsx';
// import { isGoogleAuthenticated, storeAccessToken, uploadExcelToDrive, createShareLink } from './google-drive.service';

interface UserData {
  name: string;
  intensity: number;
  rpe: number;
  heartRate: number;
}

interface WarningLog {
  id: number;
  message: string;
  type: 'critical' | 'warning';
  timestamp: Date;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, NgIf, NgFor, DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('fitness-tracker');
  // Track which auth tab is active: 'user' or 'admin'
  public activeTab: 'user' | 'admin' = 'user';
  warningLogs = signal<WarningLog[]>([]);
  
  userData: UserData = {
    name: '',
    intensity: 10,
    rpe: 15,
    heartRate: 75,
  };

  // auth state and forms
  currentUser: { uid: string; email: string; age?: number | null } | null = null;
  authEmail = '';
  authPassword = '';
  authDisplayName = '';
  // collect age at registration to compute HRmax = 220 - age
  authAge: number | null = null;
  // optional admin code for dev-time admin creation (matches ADMIN_SECRET in env)
  authAdminCode = '';
  // toggle to reveal admin code input in the UI
  authIsAdminAttempt = false;
  // when true, save all sets for the selected week instead of a single set
  saveAllSets = false;
  isAdmin = false;
  adminRequestSent = false;

  // admin dashboard state
  usersList: Array<any> = [];
  viewedSessions: Array<any> = [];
  sessionsOwner: string | null = null;
  // all sessions (admin view)
  viewedAllSessions: Array<any> = [];
  // pagination state for all sessions
  public allSessionsPageSize = 20;
  public allSessionsCursorStack: Array<string | null> = [];
  public allSessionsCurrentCursor: string | null = null;
  public allSessionsHasMore = false;

  // id of session currently being edited in the inline panel (if any)
  public editingSessionId: string | null = null;
  // temporary edited fields for the session being edited
  public editedSession: any = {};
  // when set to a session id, the UI shows a loading state for that session's Edit button
  public loadingSessionId: string | null = null;
  // track when a session is being saved (update) or deleted, to disable buttons
  public savingSessionId: string | null = null;
  public deletingSessionId: string | null = null;
  // track which session is expanded in the sessions list (for expand/collapse)
  public expandedSessionId: string | null = null;
  // new session form state (for admin creating session for a user)
  public showNewSessionForm: boolean = false;
  public newSession: any = { week: 1, sessionNumber: 1, setNumber: 1, intensity: 10, heartRate: 75, notes: '' };

  // Google Drive integration state
  public isGoogleDriveConnected = false;
  public showGoogleDriveModal = false;

  // program weeks config (Tabata-based)
  weeks = [
    { id: '1-2', label: 'Week 1–2', sets: 2, restBetweenSets: 150, sessionsPerWeek: 2 },
    { id: '3-5', label: 'Week 3–5', sets: 3, restBetweenSets: 120, sessionsPerWeek: 2 },
    { id: '6-7', label: 'Week 6–7', sets: 3, restBetweenSets: 60, sessionsPerWeek: 3 },
    { id: '8',   label: 'Week 8',     sets: 4, restBetweenSets: 120, sessionsPerWeek: 3 }
  ];

  // expanded numeric weeks for the UI (weekNumber -> sets, sessionsPerWeek)
  numericWeeks: Array<{ week: number; sets: number; sessionsPerWeek: number; label: string }> = [];

  selectedWeek = 1; // numeric week (1..8)
  selectedSession = 1; // session number within the week (1..sessionsPerWeek)
  selectedSet = 1;

  // track which week/session/set combos the current user already saved
  // key format: "week-session-set" e.g. "1-1-2"
  submittedSetKeys = new Set<string>();

  constructor() {
    // build numericWeeks from the compact weeks ranges
    this.expandNumericWeeks();
    // subscribe to auth state so signed-in user persists across reloads
    onAuthStateChange(async (user) => {
      if (user) {
        this.currentUser = { uid: user.uid, email: user.email || '' };
        try {
          const users = await getAllUsers();
          const me = users.find(u => u.id === user.uid);
          this.isAdmin = !!(me && (me as any).isAdmin);
          if (this.isAdmin) await this.loadUsersForAdmin();
          // load user's existing sessions so we can disable already-saved sets
          await this.loadUserSessions();
        } catch (e) {
          console.warn('failed to fetch user doc to check admin status', e);
        }
      } else {
        this.currentUser = null;
        this.isAdmin = false;
      }
    });
  }
  public async openAdminDashboard(): Promise<void> {
    this.showAdminEmptyPage = false;
    this.showAdminDashboard = true;
    try {
      await this.loadUsersForAdmin();
      await this.loadAllSessions();
    } catch (err: any) {
      this.addWarningLog('Failed to load admin dashboard data: ' + (err.message || err), 'warning');
    }
  }


  // Expand week ranges like '1-2' into numeric weeks 1 and 2 with their sets
  private expandNumericWeeks() {
    this.numericWeeks = [];
    for (const w of this.weeks) {
      if (w.id.includes('-')) {
        const parts = w.id.split('-').map((p: string) => parseInt(p, 10));
        const start = parts[0];
        const end = parts[1];
        for (let i = start; i <= end; i++) {
          this.numericWeeks.push({ week: i, sets: w.sets, sessionsPerWeek: w.sessionsPerWeek, label: `Week ${i}` });
        }
      } else {
        const num = parseInt(w.id, 10);
        this.numericWeeks.push({ week: num, sets: w.sets, sessionsPerWeek: w.sessionsPerWeek, label: w.label });
      }
    }
    // ensure weeks are sorted
    this.numericWeeks.sort((a, b) => a.week - b.week);
    // pick a sensible default selectedWeek
    if (this.numericWeeks.length) this.selectedWeek = this.numericWeeks[0].week;
  }

  // load current user's sessions and populate submittedSetKeys
  async loadUserSessions() {
    if (!this.currentUser) return;
    try {
      const sessions = await getUserSessions(this.currentUser.uid);
      this.submittedSetKeys.clear();
      sessions.forEach((s: any) => {
        const wk = Number(s.week);
        const sessionNum = Number(s.sessionNumber || s.session || 1);
        const setNum = Number(s.setNumber || s.set || 1);
        if (!isNaN(wk) && !isNaN(sessionNum) && !isNaN(setNum)) {
          this.submittedSetKeys.add(`${wk}-${sessionNum}-${setNum}`);
        }
      });
      // ensure selectedWeek/set point to available option
      this.selectNextAvailableWeek();
    } catch (err) {
      console.warn('Failed to load user sessions for submitted set map', err);
    }
  }

  // helper: get sets count for a numeric week
  getSetsForWeek(weekNum: number) {
    const w = this.numericWeeks.find(x => x.week === weekNum);
    return w ? w.sets : 1;
  }

  // helper: get sessions per week for a numeric week
  getSessionsForWeek(weekNum: number) {
    const w = this.numericWeeks.find(x => x.week === weekNum);
    return w ? w.sessionsPerWeek : 1;
  }

  // Return an array [1..count] for template iteration
  getSetRange(count: number) {
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  // Fixed UI ranges per your request
  getWeekRange() { return this.getSetRange(8); }
  getSessionRange() { return this.getSetRange(3); }
  getFixedSetRange() { return this.getSetRange(4); }

  // Check whether a specific week/session/set has been submitted
  isSetSubmitted(week: number, setNum: number, sessionNum?: number) {
    const s = sessionNum || this.selectedSession;
    return this.submittedSetKeys.has(`${week}-${s}-${setNum}`);
  }

  isWeekFullySubmitted(week: number) {
    const sets = this.getSetsForWeek(week);
    const sessions = this.getSessionsForWeek(week);
    for (let s = 1; s <= sessions; s++) {
      for (let i = 1; i <= sets; i++) {
        if (!this.submittedSetKeys.has(`${week}-${s}-${i}`)) return false;
      }
    }
    return true;
  }

  // called when the user changes week in the UI - reset session/set selection
  public onWeekChange() {
    const sessions = this.getSessionsForWeek(this.selectedWeek);
    if (this.selectedSession > sessions) this.selectedSession = 1;
    this.selectedSet = 1;
  }

  // called when the user changes session in the UI - reset set selection
  public onSessionChange() {
    this.selectedSet = 1;
  }

  private selectNextAvailableWeek() {
    // find first week/session/set that has at least one non-submitted set
    for (const w of this.numericWeeks) {
      const sets = this.getSetsForWeek(w.week);
      const sessions = this.getSessionsForWeek(w.week);
      let found = false;
      for (let s = 1; s <= sessions; s++) {
        for (let i = 1; i <= sets; i++) {
          if (!this.submittedSetKeys.has(`${w.week}-${s}-${i}`)) {
            this.selectedWeek = w.week;
            this.selectedSession = s;
            this.selectedSet = i;
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (found) return;
    }
    // if all sets submitted, keep defaults
  }

  private addWarningLog(message: string, type: 'critical' | 'warning'): void {
    const newLog: WarningLog = {
      id: Date.now(),
      message,
      type,
      timestamp: new Date()
    };
    
    this.warningLogs.update(logs => [...logs, newLog]);
    
    // Auto remove non-critical warnings after 5 seconds
    if (type !== 'critical') {
      setTimeout(() => {
        this.removeWarningLog(newLog.id);
      }, 5000);
    }
  }

  removeWarningLog(id: number): void {
    this.warningLogs.update(logs => logs.filter(log => log.id !== id));
  }

  onSubmit(): void {

    // If we know the user's age, compute HRmax and warn if exceeded
    if (this.currentUser && typeof this.currentUser.age === 'number') {
      const hrMax = 220 - this.currentUser.age;
      if (this.userData.heartRate > hrMax) {
        this.addWarningLog('STOP TRAINING IMMEDIATELY! Heart rate is too high!', 'critical');
        console.error('Critical heart rate detected:', this.userData.heartRate, 'hrMax:', hrMax);
        return;
      }
    } else {
      // fallback static threshold as a last resort
      if (this.userData.heartRate > 195) {
        this.addWarningLog('STOP TRAINING IMMEDIATELY! Heart rate is too high!', 'critical');
        console.error('Critical heart rate detected:', this.userData.heartRate);
        return;
      }
    }

    if (this.userData.intensity < 15) {
      this.addWarningLog('Exercise intensity is low. Try to increase your intensity by:\n• Adding more repetitions', 'warning');
      console.warn('Low intensity detected:', this.userData.intensity);
    }

    console.log('Form submitted:', this.userData);
  }

  // --- Authentication flow ---
  async signUp(): Promise<void> {
    try {
      // require age during sign up so HRmax can be computed
      const age = typeof this.authAge === 'string' ? parseInt(this.authAge, 10) : this.authAge;
      if (typeof age !== 'number' || isNaN(age) || age <= 0 || age > 120) {
        this.addWarningLog('Please enter a valid age (1-120) to complete registration', 'warning');
        return;
      }

      const user = await signUpUser(this.authEmail, this.authPassword, this.authDisplayName || undefined, this.authAdminCode || undefined, age);
      this.currentUser = { uid: user.uid, email: user.email || '' };
      // attach age locally
      this.currentUser.age = this.authAge;
      this.addWarningLog('Sign up successful. Welcome!', 'warning');
      await this.loadUserSessions();
    } catch (err: any) {
      this.addWarningLog('Sign up failed: ' + (err.message || err), 'warning');
      console.error('signUp error', err);
    }
  }

  // Create a sample user with preset values and sign in immediately (development helper)
  public async createSampleUserAndSignIn(): Promise<void> {
    try {
      this.authEmail = 'you@example.com';
      this.authPassword = 'password';
      this.authDisplayName = 'Jane';
      // default sample age; adjust as needed for testing HRmax
      this.authAge = 30;
      await this.signUp();
      // ensure the UI selects the first week/session/set and prefill sample data
      this.selectedWeek = 1;
      this.selectedSession = 1;
      this.selectedSet = 1;
      this.userData.intensity = 10;
      // leave heartRate as default or you can preset here
      this.addWarningLog('Sample user created and signed in', 'warning');
    } catch (e: any) {
      this.addWarningLog('Failed to create sample user: ' + (e.message || e), 'warning');
    }
  }

  async signIn(): Promise<void> {
    try {
      const user = await signInUser(this.authEmail, this.authPassword);
      this.currentUser = { uid: user.uid, email: user.email || '' };
      this.addWarningLog('Signed in successfully', 'warning');
      // determine admin status: either user doc has isAdmin or the account
      // matches the configured development ADMIN_EMAIL.
      try {
        const me = await getUserById(user.uid);
        this.isAdmin = !!(me && (me as any).isAdmin) || (user.email === ADMIN_EMAIL);
        if (this.isAdmin) {
          try {
            await this.loadUsersForAdmin();
          } catch (err) {
            // loading users may fail if security rules require isAdmin on the user doc
            console.warn('Could not load users for admin (security rules may block it):', err);
          }
        }
        // attach age if present
        if (me && typeof (me as any).age === 'number') {
          this.currentUser.age = (me as any).age;
        }
      } catch (e) {
        console.warn('failed to fetch user doc to check admin status', e);
        // still allow admin if email matches
        this.isAdmin = (user.email === ADMIN_EMAIL);
      }
      // load user's sessions for disabling already-saved options
      await this.loadUserSessions();
    } catch (err: any) {
      this.addWarningLog('Sign in failed: ' + (err.message || err), 'warning');
      console.error('signIn error', err);
    }
  }

  // Sign in path that enforces the account must be an admin. If not admin, sign out and show an error.
  async signInAsAdmin(): Promise<void> {
    try {
      const user = await signInUser(this.authEmail, this.authPassword);
      try {
        const me = await getUserById(user.uid);
        const isAdmin = !!(me && (me as any).isAdmin);
        if (!isAdmin) {
          // Immediately sign out and inform the user
          await signOutUser();
          this.addWarningLog('Sign in failed: account is not an admin', 'warning');
          return;
        }

        // user is admin — set state accordingly
        this.currentUser = { uid: user.uid, email: user.email || '' };
        this.isAdmin = true;
        this.addWarningLog('Admin signed in successfully', 'warning');
        await this.loadUsersForAdmin();
      } catch (e) {
        // couldn't find user doc or check admin flag
        await signOutUser();
        this.addWarningLog('Sign in failed: unable to verify admin status', 'warning');
        console.error('admin signIn check failed', e);
      }
    } catch (err: any) {
      this.addWarningLog('Sign in failed: ' + (err.message || err), 'warning');
      console.error('signInAsAdmin error', err);
    }
  }

  async signOut(): Promise<void> {
    try {
      await signOutUser();
      this.currentUser = null;
      this.addWarningLog('Signed out', 'warning');
    } catch (err: any) {
      this.addWarningLog('Sign out failed: ' + (err.message || err), 'warning');
      console.error('signOut error', err);
    }
  }

  // Development helper: sign in with the dev admin account (creates it if missing)
  // Uses ADMIN_EMAIL and ADMIN_SECRET from the environment. Dev-only convenience.
  public async signInOrCreateDevAdmin(): Promise<void> {
    try {
      // Try sign in first
      const user = await signInUser(ADMIN_EMAIL, ADMIN_SECRET);
      this.currentUser = { uid: user.uid, email: user.email || '', age: undefined };
      this.isAdmin = true;
      this.addWarningLog('Signed in as dev admin', 'warning');
      await this.loadUsersForAdmin();
      await this.loadUserSessions();
      return;
    } catch (err: any) {
      // If sign-in failed because user doesn't exist, create the user using signUpUser
      try {
        const user = await signUpUser(ADMIN_EMAIL, ADMIN_SECRET, 'Dev Admin', ADMIN_SECRET, 30);
        this.currentUser = { uid: user.uid, email: user.email || '', age: 30 };
        this.isAdmin = true;
        // show temporary empty admin landing page by default
        this.showAdminEmptyPage = true;
        this.showAdminDashboard = false;
        this.addWarningLog('Dev admin account created and signed in', 'warning');
        await this.loadUsersForAdmin();
        await this.loadUserSessions();
        return;
      } catch (err2: any) {
        this.addWarningLog('Dev admin sign-in failed: ' + (err2.message || err2), 'warning');
        console.error('Dev admin sign-in/create error', err2);
      }
    }
  }

  // show or hide the dev admin convenience in the UI
  public showDevAdmin = SHOW_DEV_ADMIN;
  // expose the dev admin email to the template
  public adminDevEmail = ADMIN_EMAIL;

  // dedicated admin login UI state (for explicit admin sign-in)
  public showAdminLogin = false;
  public adminEmail = '';
  public adminPassword = '';
  // When true, show the dedicated empty Admin landing page after successful admin sign-in
  public showAdminEmptyPage = false;
  // When true, show the full admin dashboard (users/sessions)
  public showAdminDashboard = false;

  // Open the admin login UI and prefill with static admin credentials (username/password)
  public goToAdminLogin(prefill = true) {
    this.showAdminLogin = true;
    if (prefill) {
      this.adminEmail = 'admin';
      this.adminPassword = 'admin1234';
    }
    this.showAdminEmptyPage = false;
  }

  // Attempt to sign in as admin using provided admin credentials in the admin login panel
  public async signInAdmin(): Promise<void> {
    // Simple static admin-only auth: accept either the literal 'admin' account or the configured dev admin email
    const isValidAdminCredential = 
      (this.adminEmail === 'admin' && this.adminPassword === 'admin1234') ||
      (this.adminEmail === ADMIN_EMAIL && this.adminPassword === ADMIN_SECRET);
    
    if (isValidAdminCredential) {
      try {
        // Convert 'admin' to a proper email for Firebase
        const adminEmailForFirebase = this.adminEmail === 'admin' ? 'admin@fitness-tracker.local' : this.adminEmail;
        
        // Try to sign in with Firebase
        let user;
        try {
          user = await signInUser(adminEmailForFirebase, this.adminPassword);
          console.log('Admin user signed in successfully');
        } catch (signInErr: any) {
          // If sign-in fails (user not found or wrong password), create new admin account
          if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential' || signInErr.code === 'auth/wrong-password') {
            console.log('Admin user not found or wrong password, creating new admin account...');
            // Create fresh admin account
            user = await signUpUser(adminEmailForFirebase, this.adminPassword, 'Admin', this.adminPassword, 30);
            console.log('Admin account created:', user.uid);
            // Mark as admin immediately
            await setAdminFlag(user.uid, true);
            console.log('Admin flag set');
          } else {
            throw signInErr;
          }
        }
        
        // Set signed-in state
        this.currentUser = { uid: user.uid, email: user.email || '' };
        this.isAdmin = true;
        this.showAdminEmptyPage = true;
        this.showAdminDashboard = false;
        this.addWarningLog('Signed in as admin successfully', 'warning');
        console.log('Admin state updated, ready to load data');
        
        // Give Firestore a moment to propagate the admin flag
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Load admin data
        await this.loadUsersForAdmin();
        return;
      } catch (err: any) {
        console.error('Admin sign in error:', err);
        this.addWarningLog('Admin sign in failed: ' + (err.message || err), 'warning');
        return;
      }
    }

    // If credentials do not match the static admin values, fail fast.
    this.addWarningLog('Admin sign in failed: invalid admin credentials', 'warning');
  }


  // Save a training session to Firestore for the currently signed-in user
  public async saveSession(): Promise<void> {
    if (!this.currentUser) return this.addWarningLog('Sign in first', 'warning');

    const payload = {
      week: this.selectedWeek,
      sessionNumber: this.selectedSession,
      setNumber: this.selectedSet,
      intensity: this.userData.intensity,
      heartRate: this.userData.heartRate,
      notes: `Submitted by ${this.currentUser.email || 'user'}`,
      timestamp: new Date().toISOString()
    };

    try {
      if (this.saveAllSets) {
        // find the week's sets count using numeric mapping
        const setsCount = this.getSetsForWeek(Number(this.selectedWeek));
        // ensure payload includes sessionNumber
        const ids = await recordMultipleSessions(this.currentUser.uid, payload, setsCount);
        this.addWarningLog('Saved all sets (' + ids.length + ') for week ' + this.selectedWeek + ' session ' + this.selectedSession, 'warning');
        console.log('Saved multiple sessions', ids, payload);
        // mark all sets for this week/session as submitted
        for (let i = 1; i <= setsCount; i++) {
          this.submittedSetKeys.add(`${this.selectedWeek}-${this.selectedSession}-${i}`);
        }
        this.selectNextAvailableWeek();
      } else {
        // before saving, check HR against user's HRmax when age available
        if (this.currentUser && typeof this.currentUser.age === 'number') {
          const hrMax = 220 - this.currentUser.age;
          if (this.userData.heartRate > hrMax) {
            this.addWarningLog('STOP TRAINING IMMEDIATELY! Heart rate is too high!', 'critical');
            console.error('Critical heart rate detected:', this.userData.heartRate, 'hrMax:', hrMax);
            return;
          }
        }

        const id = await recordSession(this.currentUser.uid, payload);
        this.addWarningLog('Session saved (id: ' + id + ')', 'warning');
        console.log('Session saved', id, payload);
        // mark this set as submitted and try to advance to next available
        this.submittedSetKeys.add(`${this.selectedWeek}-${this.selectedSession}-${this.selectedSet}`);
        this.selectNextAvailableWeek();
      }
    } catch (err: any) {
      this.addWarningLog('Failed to save session: ' + (err.message || err), 'warning');
      console.error('saveSession error', err);
    }
  }
  // --- Admin flows ---
  async requestAdmin(): Promise<void> {
    if (!this.currentUser) return this.addWarningLog('Sign in first', 'warning');
    try {
      const id = await requestAdminAccess(this.currentUser.uid, 'Requesting admin access for dashboard');
      this.adminRequestSent = true;
      this.addWarningLog('Admin request sent (id: ' + id + ')', 'warning');
    } catch (err: any) {
      this.addWarningLog('Failed to request admin: ' + (err.message || err), 'warning');
    }
  }

  async loadUsersForAdmin(): Promise<void> {
    try {
      console.log('Loading users for admin...');
      this.usersList = await getAllUsers();
      console.log('Users loaded:', this.usersList);
      this.addWarningLog('Loaded ' + this.usersList.length + ' users', 'warning');
    } catch (err: any) {
      console.error('Error loading users:', err);
      this.addWarningLog('Failed to load users: ' + (err.message || err), 'warning');
    }
  }

  async viewSessionsFor(userId: string): Promise<void> {
    try {
      // Toggle: if same user clicked, collapse; otherwise load new user
      if (this.sessionsOwner === userId && this.viewedSessions.length > 0) {
        // Collapse
        this.sessionsOwner = null;
        this.viewedSessions = [];
      } else {
        // Expand/load
        this.viewedSessions = await getUserSessions(userId);
        this.sessionsOwner = userId;
        this.editingSessionId = null;
        this.editedSession = {};
      }
    } catch (err: any) {
      this.addWarningLog('Failed to load sessions: ' + (err.message || err), 'warning');
    }
  }

  // Collapse sessions panel
  public collapseSessions(): void {
    this.sessionsOwner = null;
    this.viewedSessions = [];
    this.editingSessionId = null;
    this.editedSession = {};
    this.expandedSessionId = null;
  }

  // Toggle expand/collapse for a single session
  public toggleSessionExpand(sessionId: string): void {
    this.expandedSessionId = this.expandedSessionId === sessionId ? null : sessionId;
    if (this.expandedSessionId !== sessionId) {
      this.editingSessionId = null;
      this.editedSession = {};
    }
  }

  // Begin editing a session (preload canonical session data if available)
  public async startEditSession(s: any): Promise<void> {
    if (!this.sessionsOwner) return this.addWarningLog('No session owner', 'warning');
    this.loadingSessionId = s.id;
    try {
      // Try to fetch the canonical session document from Firestore
      const canonical = await getSessionById(this.sessionsOwner, s.id);
      if (canonical) {
        this.editingSessionId = s.id;
        this.editedSession = {
          intensity: canonical.intensity,
          heartRate: canonical.heartRate,
          notes: canonical.notes || ''
        };
      } else {
        // Fallback to using the provided object if canonical not found
        this.editingSessionId = s.id;
        this.editedSession = { intensity: s.intensity, heartRate: s.heartRate, notes: s.notes };
      }
    } catch (err: any) {
      console.warn('Failed to preload session for editing, falling back to local data', err);
      this.addWarningLog('Failed to preload session: ' + (err.message || err), 'warning');
      this.editingSessionId = s.id;
      this.editedSession = { intensity: s.intensity, heartRate: s.heartRate, notes: s.notes };
    } finally {
      this.loadingSessionId = null;
    }
  }

  // Cancel editing
  public cancelEditSession(): void {
    this.editingSessionId = null;
    this.editedSession = {};
  }

  // Save edited session fields to Firestore
  public async saveEditedSession(sessionId: string): Promise<void> {
    if (!this.sessionsOwner) return this.addWarningLog('No session owner', 'warning');
    this.savingSessionId = sessionId;
    try {
      const payload: any = {};
      if (this.editedSession.intensity !== undefined) payload.intensity = Number(this.editedSession.intensity);
      if (this.editedSession.heartRate !== undefined) payload.heartRate = Number(this.editedSession.heartRate);
      if (this.editedSession.notes !== undefined) payload.notes = this.editedSession.notes;
      await updateSession(this.sessionsOwner, sessionId, payload);
      this.addWarningLog('Session updated', 'warning');
      // refresh list
      this.viewedSessions = await getUserSessions(this.sessionsOwner);
      this.editingSessionId = null;
      this.editedSession = {};
      // reload user's submitted set map if current user is the owner
      if (this.currentUser && this.currentUser.uid === this.sessionsOwner) await this.loadUserSessions();
    } catch (err: any) {
      console.error('Failed to save edited session:', err);
      this.addWarningLog('Failed to save session: ' + (err.message || err), 'warning');
    } finally {
      this.savingSessionId = null;
    }
  }

  // Delete a session (with confirmation)
  public async deleteSessionForUser(sessionId: string): Promise<void> {
    if (!this.sessionsOwner) return this.addWarningLog('No session owner', 'warning');
    this.deletingSessionId = sessionId;
    try {
      const ok = confirm('Delete this session? This action cannot be undone.');
      if (!ok) return;
      await deleteSession(this.sessionsOwner, sessionId);
      this.addWarningLog('Session deleted', 'warning');
      this.viewedSessions = await getUserSessions(this.sessionsOwner);
      if (this.currentUser && this.currentUser.uid === this.sessionsOwner) await this.loadUserSessions();
    } catch (err: any) {
      console.error('Failed to delete session:', err);
      this.addWarningLog('Failed to delete session: ' + (err.message || err), 'warning');
    } finally {
      this.deletingSessionId = null;
    }
  }

  // Toggle the inline new-session form for the currently viewed user
  public toggleNewSessionForm(): void {
    this.showNewSessionForm = !this.showNewSessionForm;
    // reset newSession when showing
    if (this.showNewSessionForm) {
      this.newSession = { week: 1, sessionNumber: 1, setNumber: 1, intensity: 10, heartRate: 75, notes: '' };
    }
  }

  // Create a new session for the currently selected sessionsOwner (admin)
  public async createSessionForUser(): Promise<void> {
    if (!this.sessionsOwner) return this.addWarningLog('No session owner selected', 'warning');
    // simple validation
    const payload: any = {
      week: Number(this.newSession.week) || 1,
      sessionNumber: Number(this.newSession.sessionNumber) || 1,
      setNumber: Number(this.newSession.setNumber) || 1,
      intensity: Number(this.newSession.intensity) || 10,
      heartRate: Number(this.newSession.heartRate) || 0,
      notes: this.newSession.notes || ''
    };

    this.savingSessionId = 'new';
    try {
      await recordSession(this.sessionsOwner, payload);
      this.addWarningLog('Session created', 'warning');
      this.viewedSessions = await getUserSessions(this.sessionsOwner);
      this.showNewSessionForm = false;
      // if creating for current user, refresh their submitted set map
      if (this.currentUser && this.currentUser.uid === this.sessionsOwner) await this.loadUserSessions();
    } catch (err: any) {
      console.error('Failed to create session:', err);
      this.addWarningLog('Failed to create session: ' + (err.message || err), 'warning');
    } finally {
      this.savingSessionId = null;
    }
  }

  async makeAdmin(userId: string): Promise<void> {
    try {
      await setAdminFlag(userId, true);
      this.addWarningLog('User promoted to admin', 'warning');
      await this.loadUsersForAdmin();
    } catch (err: any) {
      this.addWarningLog('Failed to promote user: ' + (err.message || err), 'warning');
    }
  }

  // Load all sessions across users (admin only)
  async loadAllSessions(): Promise<void> {
    try {
      console.log('Loading all sessions...');
      // initial load uses paged loader
      this.allSessionsCursorStack = [];
      this.allSessionsCurrentCursor = null;
      await this.loadAllSessionsPage(null);
      console.log('All sessions loaded:', this.viewedAllSessions);
    } catch (err: any) {
      console.error('Error loading all sessions:', err);
      this.addWarningLog('Failed to load all sessions: ' + (err.message || err), 'warning');
    }
  }

  // Load a page of sessions. If cursor is null, loads the first page. Uses server helper `getAllSessionsPaged`.
  public async loadAllSessionsPage(startAfterCreatedAt: string | null): Promise<void> {
    try {
      console.log('Loading sessions page, cursor:', startAfterCreatedAt);
      // ensure we have user list to resolve emails
      if (!this.usersList || this.usersList.length === 0) {
        await this.loadUsersForAdmin();
      }
      const resp: any = await getAllSessionsPaged(this.allSessionsPageSize, startAfterCreatedAt);
      console.log('Sessions page response:', resp);
      const sessions = resp.sessions || [];
      this.viewedAllSessions = sessions.map((s: any) => {
        const u = this.usersList.find((x: any) => x.id === s.userId);
        return { ...s, userEmail: u ? u.email : (s.notes || '').match(/Submitted by (.+)/)?.[1] || s.userId };
      });
      this.allSessionsHasMore = !!resp.hasMore;
      this.allSessionsCurrentCursor = resp.lastCreatedAt || null;
    } catch (err: any) {
      console.error('Error loading sessions page:', err);
      this.addWarningLog('Failed to load sessions page: ' + (err.message || err), 'warning');
    }
  }

  // navigate to next page
  public async nextAllSessionsPage(): Promise<void> {
    // push current cursor so we can go back
    this.allSessionsCursorStack.push(this.allSessionsCurrentCursor);
    await this.loadAllSessionsPage(this.allSessionsCurrentCursor);
  }

  // navigate to previous page
  public async prevAllSessionsPage(): Promise<void> {
    if (this.allSessionsCursorStack.length === 0) return; // no previous
    const prev = this.allSessionsCursorStack.pop() || null;
    await this.loadAllSessionsPage(prev);
  }

  // Export all users and their sessions to Excel
  public async exportToExcel(): Promise<void> {
    try {
      this.addWarningLog('Preparing export...', 'warning');
      const workbook = XLSX.utils.book_new();

      // Create a summary sheet with all users
      const usersData = this.usersList.map((u: any) => ({
        'Email': u.email,
        'Age': u.age || 'N/A',
        'Admin': u.isAdmin ? 'Yes' : 'No',
        'Joined': u.createdAt ? new Date(u.createdAt).toLocaleString() : 'N/A'
      }));
      const usersSheet = XLSX.utils.json_to_sheet(usersData);
      XLSX.utils.book_append_sheet(workbook, usersSheet, 'Users');

      // Create individual sheets for each user's sessions
      for (const user of this.usersList) {
        try {
          const sessions = await getUserSessions(user.id);
          const sessionsData = sessions.map((s: any) => ({
            'Week': s.week,
            'Session': s.sessionNumber || s.session || 'N/A',
            'Set': s.setNumber || s.set || 'N/A',
            'Intensity': s.intensity || 'N/A',
            'Heart Rate (bpm)': s.heartRate || 'N/A',
            'Notes': s.notes || '',
            'Created': s.createdAt ? new Date(s.createdAt).toLocaleString() : 'N/A',
            'Updated': s.updatedAt ? new Date(s.updatedAt).toLocaleString() : ''
          }));
          
          if (sessionsData.length > 0) {
            const sheetName = user.email.substring(0, 31); // Excel sheet name limit is 31 chars
            const sessionsSheet = XLSX.utils.json_to_sheet(sessionsData);
            XLSX.utils.book_append_sheet(workbook, sessionsSheet, sheetName);
          }
        } catch (err) {
          console.warn(`Failed to load sessions for ${user.email}:`, err);
        }
      }

      // Create a summary statistics sheet
      const stats = [
        { 'Metric': 'Total Users', 'Value': this.usersList.length },
        { 'Metric': 'Total Sessions', 'Value': this.viewedAllSessions.length },
        { 'Metric': 'Export Date', 'Value': new Date().toLocaleString() }
      ];
      const statsSheet = XLSX.utils.json_to_sheet(stats);
      XLSX.utils.book_append_sheet(workbook, statsSheet, 'Summary');

      // Generate file
      const timestamp = new Date().toISOString().slice(0, 10);
      const fileName = `fitness-tracker-${timestamp}.xlsx`;
      
      // Convert to blob for Google Drive upload if connected
      if (this.isGoogleDriveConnected) {
        try {
          const blob = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
          const fileBlob = new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          
          // this.addWarningLog('Uploading to Google Drive...', 'warning');
          // const fileId = await uploadExcelToDrive(fileName, fileBlob);
          // const shareLink = await createShareLink(fileId);
          
          // this.addWarningLog(`✓ Uploaded to Google Drive! Link: ${shareLink}`, 'warning');
          // console.log('File uploaded to Google Drive:', fileId, shareLink);
        } catch (driveErr: any) {
          console.warn('Google Drive upload failed, saving locally instead:', driveErr);
          this.addWarningLog('Google Drive upload failed, saving locally', 'warning');
          XLSX.writeFile(workbook, fileName);
        }
      } else {
        // Just download locally
        XLSX.writeFile(workbook, fileName);
        this.addWarningLog('Export completed successfully!', 'warning');
      }
    } catch (err: any) {
      console.error('Export failed:', err);
      this.addWarningLog('Export failed: ' + (err.message || err), 'warning');
    }
  }

  // Connect to Google Drive
  public async connectToGoogleDrive(): Promise<void> {
    try {
      this.addWarningLog('Setting up Google Drive connection...', 'warning');
      
      // For now, show a modal with setup instructions
      // In a production app, you'd implement OAuth 2.0 flow here
      this.showGoogleDriveModal = true;
      
      this.addWarningLog(
        'Google Drive setup:\n' +
        '1. Create a Google Cloud project\n' +
        '2. Enable Google Drive API\n' +
        '3. Create OAuth 2.0 credentials\n' +
        '4. Add Client ID and API Key to google-drive.service.ts',
        'warning'
      );
    } catch (err: any) {
      this.addWarningLog('Failed to connect to Google Drive: ' + (err.message || err), 'warning');
    }
  }

  // Disconnect from Google Drive
  public disconnectFromGoogleDrive(): void {
    this.isGoogleDriveConnected = false;
    localStorage.removeItem('google_access_token');
    this.addWarningLog('Disconnected from Google Drive', 'warning');
    this.showGoogleDriveModal = false;
  }
}
