const fs = require('fs');
const content = fs.readFileSync('frontend/src/visualizer/index.jsx', 'utf8');

const regexHHHL = /\{hhhlInsight\.historical_cycles\.length > 10 && \(\s*<div style=\{\{ display: 'flex'[\s\S]*?<\/div>\s*\)\}\s*<\/div>/g;

const replaceHHHL = `{hhhlInsight.historical_cycles.length > 5 && (
                    <div style={{ marginTop: 16, textAlign: 'center' }}>
                      <button 
                        onClick={() => onNavigate('research:hhhl_full_report')} 
                        style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '8px 20px', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
                      >
                        View Full Pattern History
                      </button>
                    </div>
                  )}
                </div>`;

let newContent = content.replace(regexHHHL, replaceHHHL);

fs.writeFileSync('frontend/src/visualizer/index.jsx', newContent);
