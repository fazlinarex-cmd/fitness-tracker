import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface UserData {
  name: string;
  activity: string;
  duration: number;
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
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('fitness-tracker');
  warningLogs = signal<WarningLog[]>([]);
  
  userData: UserData = {
    name: '',
    activity: '',
    duration: 30,
    intensity: 10,
    rpe: 15,
    heartRate: 75,
  };

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
    if (this.userData.heartRate > 195) {
      this.addWarningLog(
        'STOP TRAINING IMMEDIATELY! Heart rate is too high!',
        'critical'
      );
      console.error('Critical heart rate detected:', this.userData.heartRate);
      return;
    }

    if (this.userData.intensity < 14) {
      this.addWarningLog(
        'Exercise intensity is low. Try to increase your intensity by:' +
        '\n• Adding more repetitions',
        'warning'
      );
      console.warn('Low intensity detected:', this.userData.intensity);
    }

    console.log('Form submitted:', this.userData);
  }
}
