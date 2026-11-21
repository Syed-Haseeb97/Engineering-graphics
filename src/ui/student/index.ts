import { StudentApp } from './student-app';
import './styles.css';

export * from './api-client';
export * from './state';
export * from './student-app';
export * from './types';

// Mount the Student App if in browser
function mount() {
  const container = document.getElementById('app');
  if (container && !container.hasChildNodes()) {
    new StudentApp(container);
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
}
