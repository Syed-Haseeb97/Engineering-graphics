import type { StudentProfile } from '../types';

export interface LoginViewOptions {
  readonly onLogin: (profile: StudentProfile) => void;
}

export function renderLoginView(container: HTMLElement, options: LoginViewOptions): void {
  container.innerHTML = `
    <main class="login-wrapper" role="main">
      <div class="login-card">
        <header class="login-header">
          <div class="login-icon">📐</div>
          <h1 class="login-title">Engineering Graphics</h1>
          <p class="login-subtitle">Interactive Student CAD & Automated Assessment</p>
        </header>

        <form id="form-login" class="login-form">
          <div class="form-group">
            <label for="input-email" class="form-label">College Institutional Email</label>
            <input
              type="email"
              id="input-email"
              class="form-control"
              placeholder="e.g. aarav.p@college.edu"
              required
            />
          </div>

          <div class="form-group">
            <label for="input-roll-no" class="form-label">Student Roll Number</label>
            <input
              type="text"
              id="input-roll-no"
              class="form-control"
              placeholder="e.g. 22BCE10001"
              required
            />
          </div>

          <div class="form-group">
            <label for="select-section" class="form-label">Enrolled Section</label>
            <select id="select-section" class="form-control">
              <option value="A">Section A (Computer Engineering)</option>
              <option value="B">Section B (Mechanical Engineering)</option>
              <option value="C">Section C (Electrical Engineering)</option>
            </select>
          </div>

          <button type="submit" id="btn-login-submit" class="btn btn-primary btn-block">
            Sign In to Classroom
          </button>
        </form>

        <div class="quick-login-section">
          <p class="quick-login-title">Or Instant Login as Demo Student:</p>
          <div class="quick-login-buttons">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-demo-aarav">
              Aarav Patel (Sec A)
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-demo-priya">
              Priya Sharma (Sec A)
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-demo-vikram">
              Vikram Mehta (Sec B)
            </button>
          </div>
        </div>
      </div>
    </main>
  `;

  const form = container.querySelector('#form-login') as HTMLFormElement;
  const emailInput = container.querySelector('#input-email') as HTMLInputElement;
  const rollInput = container.querySelector('#input-roll-no') as HTMLInputElement;
  const sectionSelect = container.querySelector('#select-section') as HTMLSelectElement;

  function doLogin(profile: StudentProfile): void {
    options.onLogin(profile);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const rollNo = rollInput.value.trim().toUpperCase();
    const section = sectionSelect.value;
    const name = email.split('@')[0]?.replace(/\./g, ' ') ?? rollNo;

    // Generate mock token carrying claims for development / tests
    const mockToken = btoa(JSON.stringify({ sub: `usr_${rollNo}`, email, rollNo, section }));

    doLogin({
      id: `00000000-0000-0000-0001-000000000001`,
      email,
      rollNo,
      name,
      section,
      token: mockToken,
    });
  });

  // Demo Student Quick Selectors
  container.querySelector('#btn-demo-aarav')?.addEventListener('click', () => {
    const mockToken = btoa(JSON.stringify({ sub: '00000000-0000-0000-0001-000000000001', email: 'aarav.p@college.edu' }));
    doLogin({
      id: '00000000-0000-0000-0001-000000000001',
      email: 'aarav.p@college.edu',
      rollNo: '22BCE10001',
      name: 'Aarav Patel',
      section: 'A',
      token: mockToken,
    });
  });

  container.querySelector('#btn-demo-priya')?.addEventListener('click', () => {
    const mockToken = btoa(JSON.stringify({ sub: '00000000-0000-0000-0001-000000000002', email: 'priya.s@college.edu' }));
    doLogin({
      id: '00000000-0000-0000-0001-000000000002',
      email: 'priya.s@college.edu',
      rollNo: '22BCE10002',
      name: 'Priya Sharma',
      section: 'A',
      token: mockToken,
    });
  });

  container.querySelector('#btn-demo-vikram')?.addEventListener('click', () => {
    const mockToken = btoa(JSON.stringify({ sub: '00000000-0000-0000-0002-000000000001', email: 'vikram.m@college.edu' }));
    doLogin({
      id: '00000000-0000-0000-0002-000000000001',
      email: 'vikram.m@college.edu',
      rollNo: '22BME10001',
      name: 'Vikram Mehta',
      section: 'B',
      token: mockToken,
    });
  });
}
