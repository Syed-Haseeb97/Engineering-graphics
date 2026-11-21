import { InstructorApp } from './instructor-app';
import './styles.css';

export * from './api-client';
export * from './export';
export * from './instructor-app';
export * from './similarity';
export * from './state';
export * from './types';

// Mount Instructor Studio if in browser
function mount() {
  const container = document.getElementById('app');
  if (container && !container.hasChildNodes()) {
    new InstructorApp(container);
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
}
