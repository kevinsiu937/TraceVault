export class DashboardStyle {
  render(): string {
    return `<style>
:root{
  color-scheme:light dark;
  --bg:#f5f5f7;--panel:#ffffff;--panel-2:#f8f8fa;--text:#1d1d1f;--muted:#6e6e73;
  --line:rgba(0,0,0,.08);--accent:#0071e3;--accent-bg:rgba(0,113,227,.1);
  --ok:#1a7f37;--ok-bg:#e8f5ec;--err:#b42318;--err-bg:#fdecea;
  --warn:#8a5a00;--warn-bg:#fff4d6;--gap:#5f5f66;--gap-bg:#ececef;
  --kind-hook:#0071e3;--kind-document:#8944ab;--kind-mcp:#0b7285;--kind-skill:#c2410c;
  --kind-session:#8e8e93;--kind-gap:#a16207;--kind-duplicate:#8e8e93;
  --radius:18px;--shadow:0 1px 2px rgba(0,0,0,.04),0 8px 30px rgba(0,0,0,.06);
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:#000000;--panel:#1c1c1e;--panel-2:#242426;--text:#f5f5f7;--muted:#98989d;
    --line:rgba(255,255,255,.12);--accent:#0a84ff;--accent-bg:rgba(10,132,255,.16);
    --ok:#30d158;--ok-bg:rgba(48,209,88,.15);--err:#ff453a;--err-bg:rgba(255,69,58,.15);
    --warn:#ffd60a;--warn-bg:rgba(255,214,10,.15);--gap:#c7c7cc;--gap-bg:rgba(255,255,255,.08);
    --kind-hook:#0a84ff;--kind-document:#bf5af2;--kind-mcp:#40c8e0;--kind-skill:#ff9f0a;
    --kind-session:#8e8e93;--kind-gap:#ffd60a;--kind-duplicate:#8e8e93;
    --shadow:0 1px 2px rgba(0,0,0,.5),0 12px 40px rgba(0,0,0,.45);
  }
}
*{box-sizing:border-box}
body{
  margin:0;background:var(--bg);color:var(--text);
  font:15px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;
}
main{max-width:1080px;margin:0 auto;padding:48px 24px 96px}
header.top{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:24px}
h1{font-size:32px;line-height:1.15;letter-spacing:-.02em;font-weight:600;margin:0 0 6px}
h1 code{font-size:25px;font-weight:600;letter-spacing:-.01em;overflow-wrap:anywhere}
.sub{color:var(--muted);font-size:14px;margin:0}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.back{display:inline-block;margin:0 16px 18px 0;font-size:14px}
.muted{color:var(--muted)}
.mono,code{font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.card{background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
.empty{padding:64px 24px;text-align:center;color:var(--muted)}
.result-count{margin:0 0 12px;color:var(--muted);font-size:12.5px}

/* session list */
table{width:100%;border-collapse:collapse}
thead th{
  position:sticky;top:0;z-index:1;padding:14px 20px;text-align:left;
  font-size:11.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);
  background:var(--panel);border-bottom:1px solid var(--line);
}
tbody td{padding:16px 20px;border-bottom:1px solid var(--line);vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover{background:color-mix(in srgb,var(--text) 4%,transparent)}
.right{text-align:right;white-space:nowrap}

/* pills */
.pill{
  display:inline-flex;align-items:center;border-radius:999px;padding:3px 10px;
  font-size:12px;font-weight:600;letter-spacing:.01em;text-transform:capitalize;white-space:nowrap;
}
.pill.ok{background:var(--ok-bg);color:var(--ok)}
.pill.error{background:var(--err-bg);color:var(--err)}
.pill.denied{background:var(--warn-bg);color:var(--warn)}
.pill.gap,.pill.boundary,.pill.closed,.pill.duplicate{background:var(--gap-bg);color:var(--gap)}
.pill.open{background:var(--ok-bg);color:var(--ok)}

/* filters */
.filters{
  position:sticky;top:0;z-index:3;
  background:color-mix(in srgb,var(--bg) 88%,transparent);
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  border-bottom:1px solid var(--line);
  padding:10px 0 12px;margin:0 0 10px;
}
.legend,.chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.legend{margin-bottom:6px}
.chips{margin:6px 0}
.chip{
  display:inline-flex;align-items:center;gap:6px;
  border:1px solid var(--line);border-radius:999px;padding:4px 11px;
  color:var(--text);background:var(--panel);font-size:12.5px;line-height:1.4;
  transition:border-color .15s ease,background .15s ease,color .15s ease;
}
.chip:hover{border-color:color-mix(in srgb,var(--accent) 45%,var(--line));text-decoration:none}
.chip.active{background:var(--accent-bg);border-color:color-mix(in srgb,var(--accent) 55%,transparent);color:var(--accent)}
.chip.clear{color:var(--muted)}
.legend-count{color:var(--muted);font-variant-numeric:tabular-nums}
.search{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}
.search input[type=search]{
  flex:1 1 240px;min-width:0;border:1px solid var(--line);border-radius:999px;
  background:var(--panel);color:var(--text);padding:7px 13px;font:inherit;font-size:13px;
}
.search input[type=search]:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:transparent}
.search button{
  border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--text);
  padding:7px 14px;font:inherit;font-size:13px;cursor:pointer;
}
.search button:hover{border-color:var(--accent);color:var(--accent)}

/* timeline */
.timeline{
  list-style:none;margin:0;padding:4px 0;position:relative;
  background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;
}
.timeline::before{
  content:"";position:absolute;left:109px;top:10px;bottom:10px;width:2px;
  background:var(--line);
}
.event{position:relative;margin:0;padding:0}
.event-details{border-bottom:1px solid var(--line)}
.event:last-child .event-details{border-bottom:none}
.event-details[open]{background:var(--panel-2)}
.event-row{
  display:grid;grid-template-columns:64px 28px minmax(0,1fr) auto;
  gap:12px;align-items:center;padding:11px 20px;cursor:pointer;list-style:none;
}
.event-row::-webkit-details-marker{display:none}
.event-row:hover{background:color-mix(in srgb,var(--text) 4%,transparent)}
.event-row:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.event-time{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
.marker{
  width:12px;height:12px;border-radius:50%;background:var(--kind-session);
  border:2px solid var(--panel);box-shadow:0 0 0 3px var(--panel);
  justify-self:center;position:relative;z-index:1;
}
.marker[data-kind="hook.script"]{background:var(--kind-hook)}
.marker[data-kind="document.access"]{background:var(--kind-document)}
.marker[data-kind="mcp.call"]{background:var(--kind-mcp)}
.marker[data-kind="skill.call"]{background:var(--kind-skill)}
.marker[data-kind="session.start"],.marker[data-kind="session.end"]{background:var(--kind-session)}
.marker[data-kind="capture.gap"]{background:var(--kind-gap)}
.marker[data-kind="capture.duplicate"]{background:var(--kind-duplicate)}
.event[data-outcome="error"] .marker{outline:2px solid var(--err);outline-offset:2px}
.event[data-outcome="denied"] .marker{outline:2px dashed var(--warn);outline-offset:2px}
.event-main{display:flex;flex-direction:column;gap:3px;min-width:0;align-items:flex-start}
.kind-label{
  display:inline-flex;align-self:flex-start;border-radius:999px;padding:1px 7px;
  background:var(--panel-2);border:1px solid var(--line);
  font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);
}
.target{overflow-wrap:anywhere;font-size:13px;line-height:1.45}
.event[data-outcome="error"] .target{color:var(--err)}
.event-side{display:flex;align-items:center;gap:10px;white-space:nowrap}
.chevron{
  width:6px;height:6px;border-right:1.5px solid var(--muted);border-bottom:1.5px solid var(--muted);
  transform:rotate(-45deg);transition:transform .15s ease;margin-left:2px;
}
.event-details[open] .chevron{transform:rotate(45deg)}
.event-detail{padding:0 20px 14px 136px}
.event-detail pre{
  margin:0;max-height:340px;overflow:auto;padding:12px 14px;border-radius:12px;
  background:var(--bg);border:1px solid var(--line);color:var(--text);
  font:11.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;
}
@media (prefers-reduced-motion:reduce){
  .chip,.chevron{transition:none}
}

/* activity groups */
.group{margin:0 0 22px}
.group-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding:0 4px 8px}
.group-head a{font-weight:600;color:var(--text)}
.group-head .mono{font-size:11.5px}
.group .timeline{box-shadow:var(--shadow)}

@media (max-width:640px){
  main{padding:28px 14px 64px}
  header.top{flex-direction:column;gap:8px}
  h1{font-size:26px}
  h1 code{font-size:20px}
  .event-row{grid-template-columns:20px minmax(0,1fr) auto;gap:10px;padding:10px 14px}
  .event-time{display:none}
  .timeline::before{left:23px;top:8px;bottom:8px}
  .event-detail{padding-left:44px;padding-right:14px}
  .event-side .pill{font-size:11px;padding:2px 8px}
  .group-head{align-items:flex-start;flex-direction:column;gap:2px}
}
</style>`;
  }
}
