// SURGERY — patient vitals: HR / BP / SpO2 + a 0..1 "stability" that drops on errors and recovers with steady work.
// Drives the banner readout and the ART vitals-monitor prop (if present).

export function createVitals({ banner, monitor, baseHr = 74 } = {}) {
  const v = { hr: baseHr, sys: 118, dia: 76, spo2: 98, stability: 1, minStability: 1, lastErr: -99, t: 0, spike: 0 };
  let pushT = 0;
  function push() {
    if (banner) banner.setVitals(v);
    if (monitor && monitor.setVitals) {
      try {
        monitor.setVitals({ hr: v.hr, bp: `${Math.round(v.sys)}/${Math.round(v.dia)}`, spo2: v.spo2 });
        monitor.setAlarm && monitor.setAlarm(v.hr > 108 || v.stability < 0.4);
      } catch { /* prop is decorative */ }
    }
  }
  const api = {
    state: v,
    /** an error of severity sev (0.3 minor .. 1 serious): HR spikes, stability drops */
    error(sev = 1) {
      v.spike += 14 * sev;
      v.stability = Math.max(0, v.stability - 0.11 * sev);
      v.minStability = Math.min(v.minStability, v.stability);
      v.lastErr = v.t;
      push();
      return v.hr + v.spike * 0.5 > 100;
    },
    /** good, steady action: small reassurance */
    good(amount = 0.02) { v.stability = Math.min(1, v.stability + amount); },
    calm() { v.spike = 0; v.stability = Math.max(v.stability, 0.92); },
    update(dt) {
      v.t += dt;
      const since = v.t - v.lastErr;
      if (since > 2.5) v.stability = Math.min(1, v.stability + 0.035 * dt);
      v.spike *= Math.exp(-dt * 0.35);
      const target = baseHr + (1 - v.stability) * 34 + v.spike + Math.sin(v.t * 0.7) * 1.2;
      v.hr += (target - v.hr) * Math.min(1, dt * 1.6);
      v.sys = 118 + (v.hr - baseHr) * 0.55 + Math.sin(v.t * 0.31) * 1.5;
      v.dia = 76 + (v.hr - baseHr) * 0.3;
      v.spo2 = Math.min(99, 98.4 - (1 - v.stability) * 5 + Math.sin(v.t * 0.23) * 0.4);
      pushT -= dt;
      if (pushT <= 0) { pushT = 0.25; push(); }
    },
  };
  push();
  return api;
}
