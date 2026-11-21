import { InstructorApp } from './instructor-app';
import './styles.css';

export * from './api-client';
export * from './export';
export * from './instructor-app';
export * from './similarity';
export * from './state';
export * from './types';

// Mount Instructor Studio on DOMContentLoaded if in browser
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('app');
    if (container) {
      new InstructorApp(container);
    }
  });
}
