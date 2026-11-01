// 程序化绘制的默认示例图（无外部素材）：一张“混乱的桌面”插画
window.drawSampleImage = function (w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  // 天空渐变背景
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#3a1c71'); bg.addColorStop(0.5, '#d76d77'); bg.addColorStop(1, '#ffaf7b');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  // 太阳
  const sx = w * 0.78, sy = h * 0.26, sr = h * 0.16;
  const sun = g.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.2);
  sun.addColorStop(0, '#fff6c8'); sun.addColorStop(0.45, '#ffd23f'); sun.addColorStop(1, 'rgba(255,210,63,0)');
  g.fillStyle = sun; g.beginPath(); g.arc(sx, sy, sr * 2.2, 0, Math.PI * 2); g.fill();
  // 条纹
  g.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 6; i++) g.fillRect(0, h * (0.12 + i * 0.07), w, h * 0.012);
  // 远山
  g.fillStyle = '#2b1550';
  g.beginPath(); g.moveTo(0, h * 0.72);
  for (let x = 0; x <= w; x += w / 8) g.lineTo(x, h * (0.62 + 0.08 * Math.sin(x / w * 9)));
  g.lineTo(w, h); g.lineTo(0, h); g.fill();
  // 桌面
  g.fillStyle = '#1a0f33'; g.fillRect(0, h * 0.78, w, h * 0.22);
  g.fillStyle = '#ff3d7f'; g.fillRect(0, h * 0.78, w, h * 0.012);
  // 显示器
  const mx = w * 0.18, my = h * 0.22, mw = w * 0.42, mh = h * 0.42;
  g.fillStyle = '#11131c'; roundRect(g, mx - 10, my - 10, mw + 20, mh + 20, 14); g.fill();
  const scr = g.createLinearGradient(mx, my, mx + mw, my + mh);
  scr.addColorStop(0, '#3df5c4'); scr.addColorStop(1, '#7b8cff');
  g.fillStyle = scr; g.fillRect(mx, my, mw, mh);
  // 屏幕里的窗口
  const wins = [[0.08, 0.12, 0.5, 0.4, '#ffffff'], [0.4, 0.4, 0.5, 0.45, '#fff3d6']];
  wins.forEach(([a, b, cw, ch, col]) => {
    const x = mx + mw * a, y = my + mh * b;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 6, y + 6, mw * cw, mh * ch);
    g.fillStyle = col; g.fillRect(x, y, mw * cw, mh * ch);
    g.fillStyle = '#ff3d7f'; g.fillRect(x, y, mw * cw, mh * 0.07);
    g.fillStyle = '#c9cde0';
    for (let i = 0; i < 3; i++) g.fillRect(x + mw * 0.03, y + mh * (0.12 + i * 0.08), mw * cw * (0.8 - i * 0.2), mh * 0.035);
  });
  // 支架
  g.fillStyle = '#11131c';
  g.fillRect(mx + mw / 2 - w * 0.02, my + mh + 10, w * 0.04, h * 0.1);
  g.fillRect(mx + mw / 2 - w * 0.08, h * 0.76, w * 0.16, h * 0.025);
  // 咖啡杯
  const cx = w * 0.72, cy = h * 0.62;
  g.fillStyle = '#fafafa'; roundRect(g, cx, cy, w * 0.08, h * 0.16, 8); g.fill();
  g.strokeStyle = '#fafafa'; g.lineWidth = h * 0.02;
  g.beginPath(); g.arc(cx + w * 0.085, cy + h * 0.07, h * 0.04, -Math.PI / 2, Math.PI / 2); g.stroke();
  g.fillStyle = '#ff3d7f'; g.fillRect(cx, cy + h * 0.05, w * 0.08, h * 0.03);
  // 便签
  [['#ffd23f', 0.86, 0.5, -0.12], ['#3df5c4', 0.06, 0.62, 0.1]].forEach(([col, a, b, r]) => {
    g.save(); g.translate(w * a, h * b); g.rotate(r);
    g.fillStyle = col; g.fillRect(-w * 0.04, -w * 0.04, w * 0.08, w * 0.08);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-w * 0.03, -w * 0.015, w * 0.06, w * 0.008); g.fillRect(-w * 0.03, w * 0.005, w * 0.04, w * 0.008);
    g.restore();
  });
  // 星星点点
  g.fillStyle = '#fff';
  for (let i = 0; i < 40; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * w;
    const y = (Math.sin(i * 78.233) * 12345.678 % 1 + 1) % 1 * h * 0.5;
    g.globalAlpha = 0.3 + (i % 5) * 0.12; g.fillRect(x, y, 2, 2);
  }
  g.globalAlpha = 1;
  // 文字（系统字体）
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.font = `800 ${Math.round(h * 0.075)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.fillText('SMASH ME', w * 0.5, h * 0.93);
  return c;
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
};
