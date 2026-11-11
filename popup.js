const $ = (id) => document.getElementById(id);
const button = $("toggle");
const noteNames = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
let running = false;
let stream;
let audioContext;
let analyser;
let samples;
let frameId;
let lastAnalysis = 0;
let lowest = null;
let highest = null;
let pitchHistory = [];
let lastVoicedAt = 0;

function noteFor(frequency) {
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  const name = `${noteNames[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
  const exact = 440 * Math.pow(2, (midi - 69) / 12);
  return { midi, name, cents: Math.round(1200 * Math.log2(frequency / exact)) };
}

button.addEventListener("click", () => {
  if (running) {
    stopCapture();
    return;
  }

  lowest = highest = null;
  pitchHistory = [];
  lastVoicedAt = 0;
  $("lowNote").textContent = $("highNote").textContent = "—";
  $("rangeSummary").textContent = "Đang chờ giọng hát…";
  $("status").textContent = "Đang kết nối trực tiếp với âm thanh tab…";

  // capture() must be invoked directly from the user's click in this popup.
  chrome.tabCapture.capture({ audio: true, video: false }, (capturedStream) => {
    const captureError = chrome.runtime.lastError;
    if (captureError || !capturedStream) {
      $("status").textContent = captureError?.message || "Không thể thu âm thanh tab này.";
      return;
    }
    startAnalysis(capturedStream);
  });
});

async function startAnalysis(capturedStream) {
  stream = capturedStream;
  try {
    audioContext = new AudioContext();
    await audioContext.resume();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    // A longer frame gives the detector more cycles for quiet and low notes.
    analyser.fftSize = 16384;
    analyser.smoothingTimeConstant = 0;
    // Keep full-band playback intact, but analyze a separate voice-focused
    // band so bass, kick drums, and bright cymbals count less toward pitch.
    source.connect(audioContext.destination);
    const highPass = audioContext.createBiquadFilter();
    highPass.type = "highpass";
    highPass.frequency.value = 70;
    highPass.Q.value = 0.707;
    const lowPass = audioContext.createBiquadFilter();
    lowPass.type = "lowpass";
    lowPass.frequency.value = 2200;
    lowPass.Q.value = 0.707;
    const silentOutput = audioContext.createGain();
    silentOutput.gain.value = 0;
    source.connect(highPass);
    highPass.connect(lowPass);
    lowPass.connect(analyser);
    analyser.connect(silentOutput);
    silentOutput.connect(audioContext.destination);
    samples = new Float32Array(analyser.fftSize);
    running = true;
    button.textContent = "■   Dừng đo";
    button.classList.add("stop");
    $("liveDot").classList.add("active");
    $("status").textContent = "Đang phân tích âm thanh tab. Giữ popup mở trong lúc đo.";
    frameId = requestAnimationFrame(analyzeFrame);
  } catch (error) {
    $("status").textContent = `Không khởi động được phân tích âm thanh: ${error.message}`;
    stopCapture();
  }
}

function analyzeFrame(now) {
  if (!running || !analyser || !audioContext) return;
  if (now - lastAnalysis >= 80) {
    lastAnalysis = now;
    analyser.getFloatTimeDomainData(samples);
    const result = detectPitch(samples, audioContext.sampleRate);
    const track = stream?.getAudioTracks()[0];

    if (audioContext.state !== "running") {
      $("frequency").textContent = `AudioContext: ${audioContext.state}`;
    } else if (track?.muted) {
      $("frequency").textContent = "Luồng âm thanh tab đang bị tắt tiếng";
    } else if (result.level < 0.00012) {
      $("frequency").textContent = `Tín hiệu nhỏ · mức ${result.level.toFixed(5)}`;
      if (now - lastVoicedAt > 450) pitchHistory = [];
    } else if (!result.frequency || result.frequency < 65 || result.frequency > 1100) {
      $("frequency").textContent = `Có âm thanh · chưa bắt được nốt · mức ${result.level.toFixed(3)}`;
      if (now - lastVoicedAt > 450) pitchHistory = [];
    } else {
      lastVoicedAt = now;
      pitchHistory.push(result.frequency);
      if (pitchHistory.length > 3) pitchHistory.shift();
      const stableFrequency = pitchHistory.slice().sort((a, b) => a - b)[Math.floor(pitchHistory.length / 2)];
      updatePitch(stableFrequency);
    }
  }
  frameId = requestAnimationFrame(analyzeFrame);
}

function updatePitch(frequency) {
  const note = noteFor(frequency);
  $("note").textContent = note.name;
  $("frequency").textContent = `${frequency.toFixed(1)} Hz · ${note.cents > 0 ? "+" : ""}${note.cents} cents`;
  $("meterFill").style.width = `${Math.max(0, Math.min(100, ((note.midi - 28) / 48) * 100))}%`;
  if (!lowest || note.midi < lowest.midi) lowest = note;
  if (!highest || note.midi > highest.midi) highest = note;
  $("lowNote").textContent = lowest.name;
  $("highNote").textContent = highest.name;
  const semitones = highest.midi - lowest.midi;
  $("rangeSummary").textContent = semitones === 0
    ? "Đã ghi nhận 1 nốt"
    : `${semitones} bán âm · ${(semitones / 12).toFixed(1)} quãng tám`;
}

function detectPitch(buffer, sampleRate) {
  const factor = 4;
  const length = Math.floor(buffer.length / factor);
  const data = new Float32Array(length);
  let mean = 0;
  for (let i = 0; i < length; i++) {
    const base = i * factor;
    mean += (buffer[base] + buffer[base + 1] + buffer[base + 2] + buffer[base + 3]) * 0.25;
  }
  mean /= length;
  let energy = 0;
  for (let i = 0; i < length; i++) {
    const base = i * factor;
    const value = (buffer[base] + buffer[base + 1] + buffer[base + 2] + buffer[base + 3]) * 0.25 - mean;
    data[i] = value;
    energy += value * value;
  }
  const rms = Math.sqrt(energy / length);
  // Keep very quiet voiced signals; normalized YIN confidence rejects most noise.
  if (rms < 0.00012) return { frequency: null, level: rms };

  const effectiveRate = sampleRate / factor;
  const minLag = Math.max(2, Math.floor(effectiveRate / 1100));
  const maxLag = Math.min(Math.floor(effectiveRate / 55), Math.floor(length / 2));
  const differences = new Float32Array(maxLag + 1);
  let runningSum = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let difference = 0;
    const limit = length - maxLag;
    for (let i = 0; i < limit; i++) {
      const delta = data[i] - data[i + lag];
      difference += delta * delta;
    }
    runningSum += difference;
    differences[lag] = runningSum ? (difference * lag) / runningSum : 1;
  }
  let selectedLag = -1;
  let bestLag = -1;
  let bestDifference = Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (differences[lag] < bestDifference) {
      bestDifference = differences[lag];
      bestLag = lag;
    }
    // A slightly relaxed threshold is more responsive to mixed and quiet audio.
    if (differences[lag] < 0.20) {
      while (lag < maxLag && differences[lag + 1] < differences[lag]) lag++;
      selectedLag = lag;
      break;
    }
  }
  // Some real notes in a dense mix do not cross the strict YIN threshold.
  if (selectedLag < 0 && bestDifference < 0.32) selectedLag = bestLag;
  if (selectedLag < 0) return { frequency: null, level: rms };

  const left = differences[selectedLag - 1] ?? differences[selectedLag];
  const center = differences[selectedLag];
  const right = differences[selectedLag + 1] ?? center;
  const denominator = 2 * (left - 2 * center + right);
  const adjustment = denominator ? (left - right) / denominator : 0;
  const period = selectedLag + Math.max(-0.5, Math.min(0.5, adjustment));
  return { frequency: effectiveRate / period, level: rms };
}

function stopCapture() {
  running = false;
  if (frameId) cancelAnimationFrame(frameId);
  frameId = null;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  if (audioContext) audioContext.close().catch(() => {});
  audioContext = null;
  analyser = null;
  button.textContent = "▶   Bắt đầu đo";
  button.classList.remove("stop");
  $("liveDot").classList.remove("active");
  $("status").textContent = "Đã dừng. Quãng giọng phiên này vẫn được giữ.";
}

window.addEventListener("pagehide", () => {
  if (stream) stream.getTracks().forEach((track) => track.stop());
  if (audioContext) audioContext.close().catch(() => {});
});
