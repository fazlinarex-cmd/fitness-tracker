// // Google Drive service for uploading Excel files
// // This service handles authentication and file uploads to Google Drive

// const GOOGLE_CLIENT_ID = ''; // Set this in your Firebase/Google Cloud console
// const GOOGLE_API_KEY = ''; // Set this in your Firebase/Google Cloud console
// const SCOPES = 'https://www.googleapis.com/auth/drive.file';

// let gapi: any = null;
// let tokenClient: any = null;

// /**
//  * Initialize the Google API client (call this on app startup if user is authenticated)
//  */
// export async function initializeGoogleDriveAPI(): Promise<void> {
//   return new Promise((resolve, reject) => {
//     // Load the Google API library
//     const script = document.createElement('script');
//     script.src = 'https://apis.google.com/js/api.js';
//     script.onload = () => {
//       // Load the necessary Google API modules
//       window.gapi.load('client', async () => {
//         try {
//           await window.gapi.client.init({
//             apiKey: GOOGLE_API_KEY,
//             discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
//           });
//           gapi = window.gapi;
//           resolve();
//         } catch (err) {
//           console.error('Failed to initialize Google API:', err);
//           reject(err);
//         }
//       });
//     };
//     script.onerror = () => reject(new Error('Failed to load Google API script'));
//     document.head.appendChild(script);
//   });
// }

// /**
//  * Authenticate the user with Google (OAuth 2.0)
//  */
// export async function authenticateWithGoogle(): Promise<string> {
//   return new Promise((resolve, reject) => {
//     const script = document.createElement('script');
//     script.src = 'https://accounts.google.com/gsi/client';
//     script.onload = () => {
//       tokenClient = window.google.accounts.oauth2.initTokenClient({
//         client_id: GOOGLE_CLIENT_ID,
//         scope: SCOPES,
//         callback: (response: any) => {
//           if (response.access_token) {
//             resolve(response.access_token);
//           } else {
//             reject(new Error('No access token received'));
//           }
//         }
//       });
//       tokenClient.requestAccessToken();
//     };
//     script.onerror = () => reject(new Error('Failed to load Google Sign-In'));
//     document.head.appendChild(script);
//   });
// }

// /**
//  * Upload an Excel file to Google Drive
//  * @param fileName - Name of the file to upload
//  * @param fileBlob - The file content as a Blob
//  * @returns File ID on Google Drive
//  */
// export async function uploadExcelToDrive(fileName: string, fileBlob: Blob): Promise<string> {
//   if (!gapi || !gapi.client.drive) {
//     throw new Error('Google Drive API not initialized. Call initializeGoogleDriveAPI first.');
//   }

//   const metadata = {
//     name: fileName,
//     mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
//   };

//   const form = new FormData();
//   form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
//   form.append('file', fileBlob);

//   try {
//     const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
//       method: 'POST',
//       headers: {
//         Authorization: `Bearer ${getStoredAccessToken()}`
//       },
//       body: form
//     });

//     if (!response.ok) {
//       throw new Error(`Upload failed: ${response.statusText}`);
//     }

//     const result = await response.json();
//     return result.id; // Return the file ID
//   } catch (err) {
//     console.error('Error uploading to Google Drive:', err);
//     throw err;
//   }
// }

// /**
//  * Get stored access token from localStorage
//  */
// function getStoredAccessToken(): string {
//   const token = localStorage.getItem('google_access_token');
//   if (!token) {
//     throw new Error('No Google access token found. Please authenticate first.');
//   }
//   return token;
// }

// /**
//  * Store access token in localStorage
//  */
// export function storeAccessToken(token: string): void {
//   localStorage.setItem('google_access_token', token);
// }

// /**
//  * Clear stored access token
//  */
// export function clearAccessToken(): void {
//   localStorage.removeItem('google_access_token');
// }

// /**
//  * Check if user is authenticated with Google
//  */
// export function isGoogleAuthenticated(): boolean {
//   return !!localStorage.getItem('google_access_token');
// }

// /**
//  * Create a shared link for the uploaded file
//  */
// export async function createShareLink(fileId: string): Promise<string> {
//   try {
//     const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
//       method: 'POST',
//       headers: {
//         Authorization: `Bearer ${getStoredAccessToken()}`,
//         'Content-Type': 'application/json'
//       },
//       body: JSON.stringify({
//         role: 'reader',
//         type: 'anyone'
//       })
//     });

//     if (!response.ok) {
//       throw new Error(`Failed to create share link: ${response.statusText}`);
//     }

//     // Return the Google Drive link
//     return `https://drive.google.com/file/d/${fileId}/view`;
//   } catch (err) {
//     console.error('Error creating share link:', err);
//     throw err;
//   }
// }
