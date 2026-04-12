const form = document.getElementById('form');
const statusEl = document.getElementById('status');
const outputEl = document.getElementById('output');
const submitBtn = document.getElementById('submitBtn');

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? '#dc2626' : '#1f2937';
}

function renderImageFromUrl(url) {
  outputEl.classList.remove('empty');
  outputEl.innerHTML = `
    <img src="${url}" alt="Generated" />
    <a class="download" href="${url}" target="_blank" rel="noreferrer">Open / Download</a>
  `;
}

function renderImageFromBase64(base64) {
  const src = `data:image/png;base64,${base64}`;
  outputEl.classList.remove('empty');
  outputEl.innerHTML = `
    <img src="${src}" alt="Generated" />
    <a class="download" href="${src}" download="generated.png">Download</a>
  `;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const prompt = document.getElementById('prompt').value.trim();
  const model = document.getElementById('model').value.trim();
  const size = document.getElementById('size').value;

  if (!prompt) {
    setStatus('Prompt is required.', true);
    return;
  }

  submitBtn.disabled = true;
  setStatus('Generating image...');

  try {
    const resp = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model, size }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data?.error || 'Failed to generate image');
    }

    if (data.kind === 'url' && data.imageUrl) {
      renderImageFromUrl(data.imageUrl);
      setStatus('Done.');
      return;
    }

    if (data.kind === 'b64' && data.imageBase64) {
      renderImageFromBase64(data.imageBase64);
      setStatus('Done.');
      return;
    }

    throw new Error('Unexpected response format');
  } catch (err) {
    setStatus(err.message || 'Unknown error', true);
  } finally {
    submitBtn.disabled = false;
  }
});
