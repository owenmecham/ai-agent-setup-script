// --- State ---
let steps = [];
let logExpanded = true;
let eventSource = null;

// --- Screen Management ---

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');

  if (name === 'install') {
    loadSteps();
    connectLogStream();
  }
  if (name === 'verify') {
    runVerification();
  }
}

// --- Prerequisites ---

let fdaGranted = false;
let accessibilityGranted = false;

function updatePrereqButton() {
  const allChecked = Array.from(
    document.querySelectorAll('#screen-prerequisites input[type=checkbox]')
  ).every(c => c.checked);
  document.getElementById('btn-prereq-continue').disabled = !(allChecked && accessibilityGranted);
}

document.querySelectorAll('#screen-prerequisites input[type=checkbox]').forEach(cb => {
  cb.addEventListener('change', updatePrereqButton);
});

async function openFdaSettings() {
  try {
    await fetch('/api/open-fda-settings', { method: 'POST' });
  } catch { /* ignore */ }
}


async function openAccessibilitySettings() {
  try {
    await fetch('/api/open-accessibility-settings', { method: 'POST' });
  } catch { /* ignore */ }
}

async function checkAccessibility() {
  const statusEl = document.getElementById('accessibility-status');
  statusEl.textContent = 'Checking...';
  statusEl.className = 'perm-status checking';
  try {
    const res = await fetch('/api/check-accessibility');
    const data = await res.json();
    if (data.granted) {
      accessibilityGranted = true;
      statusEl.textContent = '✓ Granted';
      statusEl.className = 'perm-status granted';
    } else {
      accessibilityGranted = false;
      statusEl.textContent = '✗ Not granted';
      statusEl.className = 'perm-status not-granted';
    }
  } catch {
    accessibilityGranted = false;
    statusEl.textContent = 'Check failed';
    statusEl.className = 'perm-status not-granted';
  }
  updatePrereqButton();
}

// --- Steps ---

async function loadSteps() {
  try {
    const res = await fetch('/api/steps');
    steps = await res.json();
    renderSteps();
  } catch (err) {
    console.error('Failed to load steps:', err);
  }
}

function renderSteps() {
  const container = document.getElementById('steps-list');
  container.innerHTML = '';

  for (const step of steps) {
    const el = document.createElement('div');
    el.className = 'step-item step-' + step.status;
    el.id = 'step-' + step.name;

    const icon = {
      pending: '<span class="step-icon pending">&#9679;</span>',
      running: '<span class="step-icon running">&#8987;</span>',
      done: '<span class="step-icon done">&#10003;</span>',
      error: '<span class="step-icon error">&#10007;</span>',
    }[step.status] || '';

    el.innerHTML = `
      ${icon}
      <div class="step-info">
        <span class="step-label">${step.label}</span>
        <span class="step-desc">${step.description}</span>
        ${step.error ? '<span class="step-error">' + step.error + '</span>' : ''}
      </div>
      <div class="step-actions">
        ${step.status !== 'running' ? '<button class="btn small" onclick="runStep(\'' + step.name + '\')">Run</button>' : '<span class="spinner"></span>'}
      </div>
    `;

    container.appendChild(el);
  }
}

async function runStep(name) {
  const step = steps.find(s => s.name === name);
  if (!step) return;

  step.status = 'running';
  renderSteps();

  try {
    const res = await fetch('/api/steps/' + name + '/run', { method: 'POST' });
    const data = await res.json();
    step.status = data.status || (res.ok ? 'done' : 'error');
    if (data.error) step.error = data.error;
  } catch (err) {
    step.status = 'error';
    step.error = err.message;
  }

  renderSteps();
}

async function runAllSteps() {
  const btn = document.getElementById('btn-install');
  btn.disabled = true;
  btn.textContent = 'Installing...';

  try {
    await fetch('/api/run-all', { method: 'POST' });
  } catch (err) {
    console.error('Failed to start installation:', err);
  }

  // Poll for completion
  const poll = setInterval(async () => {
    try {
      const res = await fetch('/api/steps');
      steps = await res.json();
      renderSteps();

      const allDone = steps.every(s => s.status === 'done' || (!s.required && s.status === 'error'));
      const hasFatalError = steps.some(s => s.required && s.status === 'error');

      if (allDone) {
        clearInterval(poll);
        btn.style.display = 'none';
        document.getElementById('btn-to-verify').style.display = '';
      } else if (hasFatalError) {
        clearInterval(poll);
        btn.disabled = false;
        btn.textContent = 'Retry';
      }
    } catch { /* keep polling */ }
  }, 2000);
}

// --- Log Stream ---

function connectLogStream() {
  if (eventSource) return;

  eventSource = new EventSource('/api/log-stream');
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      appendLog(data.line);
    } catch { /* ignore */ }
  };

  eventSource.onerror = () => {
    // Reconnect after a delay
    eventSource.close();
    eventSource = null;
    setTimeout(connectLogStream, 3000);
  };
}

function appendLog(line) {
  const output = document.getElementById('log-output');
  const entry = document.createElement('div');
  entry.className = 'log-line';

  if (line.startsWith('---')) {
    entry.className += ' log-header-line';
  } else if (line.includes('[FAIL]')) {
    entry.className += ' log-error';
  } else if (line.includes('[PASS]')) {
    entry.className += ' log-success';
  }

  entry.textContent = line;
  output.appendChild(entry);
  output.scrollTop = output.scrollHeight;
}

function toggleLog() {
  logExpanded = !logExpanded;
  const output = document.getElementById('log-output');
  const icon = document.getElementById('log-toggle-icon');
  output.style.display = logExpanded ? 'block' : 'none';
  icon.innerHTML = logExpanded ? '&#9660;' : '&#9654;';
}


// --- Verification ---

async function runVerification() {
  const container = document.getElementById('verify-results');
  container.innerHTML = '<p>Running checks...</p>';

  const btnVerify = document.getElementById('btn-verify');
  btnVerify.disabled = true;

  try {
    const res = await fetch('/api/steps/verify/run', { method: 'POST' });
    await res.json();

    // Read results from log
    // Give a moment for SSE to deliver the results
    await new Promise(r => setTimeout(r, 1000));

    // Re-render with the steps check
    const stepsRes = await fetch('/api/steps');
    const allSteps = await stepsRes.json();
    const verifyStep = allSteps.find(s => s.name === 'verify');

    if (verifyStep && verifyStep.status === 'done') {
      container.innerHTML = '<p class="success-msg">All verification checks passed!</p>';
      document.getElementById('btn-to-launch').style.display = '';
      btnVerify.style.display = 'none';
    } else {
      container.innerHTML = '<p class="warn-msg">Some checks need attention. Check the installation log for details.</p>';
      // Still allow continuing
      document.getElementById('btn-to-launch').style.display = '';
      btnVerify.disabled = false;
    }
  } catch (err) {
    container.innerHTML = '<p class="error-msg">Verification failed: ' + err.message + '</p>';
    btnVerify.disabled = false;
  }
}

// --- Launch ---

async function launchMurph() {
  const btn = document.querySelector('#screen-launch .btn.primary');
  const launchScreen = document.getElementById('screen-launch');
  btn.disabled = true;
  btn.textContent = 'Starting...';

  try {
    const res = await fetch('/api/finish', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      btn.textContent = 'Opening Dashboard...';
      setTimeout(() => {
        window.location.href = data.dashboardUrl;
      }, 1500);
    } else {
      btn.textContent = 'Retry';
      btn.disabled = false;
      let errEl = launchScreen.querySelector('.launch-error');
      if (!errEl) {
        errEl = document.createElement('p');
        errEl.className = 'launch-error error-msg';
        launchScreen.querySelector('.launch-info').after(errEl);
      }
      errEl.textContent = data.error || 'Dashboard did not start. Check agent logs for details.';
    }
  } catch (err) {
    // Server may have already shut down (self-terminate)
    // Try opening dashboard anyway
    setTimeout(() => {
      window.location.href = 'http://localhost:3141';
    }, 2000);
  }
}
