// The welcome window: shows which message the app asked for. "?missing=<folder>" means the remembered
// workspace folder can't be found. On first launch the main button is "Open Sample…"; when a remembered
// folder is missing it is "Choose Folder…".
const missing = new URLSearchParams(location.search).get('missing');
const choose = document.querySelector('a[href="/welcome/choose"]');
const sample = document.querySelector('a[href="/welcome/sample"]');
if (missing !== null) {
  document.getElementById('first-launch').hidden = true;
  document.getElementById('missing').hidden = false;
  document.getElementById('missing-path').textContent = missing;
  sample.classList.remove('btn-primary');
  choose.classList.add('btn-primary');
}
document.querySelector('.welcome-actions .btn-primary').focus();
