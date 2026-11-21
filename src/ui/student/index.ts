import { StudentApp } from './student-app';
import './styles.css';

export * from './api-client';
export * from './state';
export * from './student-app';
export * from './types';

// Mount the Student App on DOMContentLoaded if in browser
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('app');
    if (container) {
      new StudentApp(container);
    }
  });
}
