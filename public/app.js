(() => {
  const $ = (sel) => document.querySelector(sel);
  const status = $('#status');

  function setStatus(msg, isErr) {
    status.textContent = msg || '';
    status.classList.toggle('err', !!isErr);
  }

  // Tabs
  document.querySelectorAll('.tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  function model() {
    const v = $('#model-select').value;
    return v || undefined;
  }

  async function call(path, body, resultEl, button) {
    if (button) button.disabled = true;
    setStatus('Memproses…');
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
      resultEl.textContent = json.result;
      setStatus(`Selesai (${json.model})`);
      return json;
    } catch (err) {
      resultEl.textContent = '';
      setStatus(err.message, true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  // Models
  async function loadModels() {
    try {
      const { models } = await (await fetch('/api/models')).json();
      const sel = $('#model-select');
      (models || []).forEach((m) => {
        const o = document.createElement('option');
        o.value = m; o.textContent = m;
        sel.appendChild(o);
      });
    } catch { /* gateway optional */ }
  }

  // Generator
  $('#gen-submit').addEventListener('click', () =>
    call('/api/caption', {
      topic: $('#gen-topic').value,
      niche: $('#gen-niche').value,
      tone: $('#gen-tone').value,
      audience: $('#gen-audience').value,
      count: Number($('#gen-count').value) || 5,
      model: model(),
    }, $('#gen-result'), $('#gen-submit'))
  );

  // Analyze forms
  const analyze = [
    ['#av-submit', '/api/analyze/video', '#av-result', () => ({ description: $('#av-desc').value, metrics: $('#av-metrics').value })],
    ['#ap-submit', '/api/analyze/profile', '#ap-result', () => ({ bio: $('#ap-bio').value, niche: $('#ap-niche').value, target: $('#ap-target').value })],
    ['#ac-submit', '/api/analyze/caption', '#ac-result', () => ({ captions: $('#ac-captions').value, hashtags: $('#ac-hashtags').value, metrics: $('#ac-metrics').value })],
    ['#as-submit', '/api/analyze/strategy', '#as-result', () => ({ postingHistory: $('#as-history').value })],
    ['#at-submit', '/api/analyze/trend', '#at-result', () => ({ niche: $('#at-niche').value, topics: $('#at-topics').value })],
  ];
  analyze.forEach(([btnSel, path, resSel, gather]) => {
    $(btnSel).addEventListener('click', () => {
      const body = gather(); body.model = model();
      call(path, body, $(resSel), $(btnSel));
    });
  });

  // Video frame extraction
  const FRAME_POSITIONS = [0.2, 0.5, 0.8];
  let extractedFrames = [];

  function extractFrames(video, count) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const frames = [];
      const duration = video.duration;
      if (!duration || !isFinite(duration)) return reject(new Error('Durasi video tidak terbaca'));
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      let i = 0;
      const seekNext = () => {
        if (i >= count) return resolve(frames);
        const t = duration * FRAME_POSITIONS[i % FRAME_POSITIONS.length];
        video.currentTime = Math.min(t, duration - 0.05);
        i++;
      };
      video.addEventListener('seeked', () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL('image/jpeg', 0.7));
        seekNext();
      });
      video.addEventListener('error', () => reject(new Error('Video tidak bisa dibaca browser')));
      seekNext();
    });
  }

  $('#video-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { setStatus('Video melebihi 50 MB', true); return; }
    const preview = $('#video-preview');
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    extractedFrames = [];
    $('#video-frames').innerHTML = '';
    setStatus('Mengekstrak frame…');
    preview.addEventListener('loadedmetadata', async () => {
      try {
        extractedFrames = await extractFrames(preview, 3);
        $('#video-frames').innerHTML = extractedFrames.map((f) => `<img src="${f}" />`).join('');
        setStatus(`${extractedFrames.length} frame siap`);
      } catch (err) {
        setStatus(`${err.message}. Isi transkrip manual sebagai gantinya.`, true);
      }
    }, { once: true });
  });

  $('#video-submit').addEventListener('click', () => {
    call('/api/caption/video', {
      frames: extractedFrames,
      transcript: $('#video-transcript').value,
      topic: $('#video-topic').value,
      niche: $('#video-niche').value,
      tone: $('#video-tone').value,
      count: Number($('#video-count').value) || 5,
      model: model(),
    }, $('#video-result'), $('#video-submit'));
  });

  // History
  async function loadHistory() {
    const { entries } = await (await fetch('/api/history')).json();
    const list = $('#history-list');
    list.innerHTML = '';
    (entries || []).forEach((en) => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `<div class="meta">${en.type} · ${new Date(en.createdAt).toLocaleString('id-ID')} · ${en.model || ''}</div><pre></pre>`;
      div.querySelector('pre').textContent = en.output;
      list.appendChild(div);
    });
  }
  $('#history-refresh').addEventListener('click', loadHistory);

  loadModels();
  loadHistory();
})();
