import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { importProvidersFrom } from '@angular/core';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
// note: environment file in this project has a misspelled folder/file name
// (enviroments/enviroment.ts). Import the actual file so the build finds it.
import { environment } from './app/enviroments/enviroment';


// Bootstrap the actual App component (not AppComponent) and merge the
// application-level providers from `appConfig` with the Firebase providers.
bootstrapApplication(App, {
  providers: [
    // spread providers declared in appConfig
    ...(appConfig && (appConfig.providers || [])),
    // add Firebase providers directly (each returns a Provider)
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore())
  ]
});
