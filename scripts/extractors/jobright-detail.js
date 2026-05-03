// Jobright /jobs/info/<id> detail-page extractor.
// Returns a single JSON line so callers can pipe to data/scan-runs/<id>.json.
// Used by mode: newgrad-recommend-scan. Run via: bb-browser eval <this-file>.
(() => {
  const allText = document.body.innerText;
  const lines = allText.split('\n').map(s => s.trim()).filter(Boolean);

  let company = null;
  for (const l of lines) {
    const m = l.match(/^(.+?)\s+·\s+(\d+\s+(hours?|minutes?|days?|day)\s+ago)$/);
    if (m) { company = m[1].trim(); break; }
  }

  const h1 = document.querySelector('h1');
  const matchMatch = allText.match(/(\d{2,3})%\s*(STRONG MATCH|GOOD MATCH|FAIR MATCH|WEAK MATCH)/);
  const h1b = /H1B Sponsor Likely/.test(allText) ? 'H1B Likely'
            : /No H1B/.test(allText) ? 'No H1B'
            : /H1B Sponsorship/.test(allText) ? 'H1B Likely (company has history)'
            : 'Unknown';

  const salaryLine = lines.find(l => /\$\d/.test(l) && /\/yr/.test(l));
  const locLine = lines.find(l => /,\s*[A-Z]{2}/.test(l) && l.length < 60) || null;
  const postedLine = lines.find(l => /(\d+ (hours?|minutes?|days?) ago)/.test(l));
  const expLine = lines.find(l => /years exp/.test(l));
  const stageLine = lines.find(l => /(Public Company|Late Stage|Early Stage|Seed)/.test(l));
  const remoteLine = lines.find(l => /^(Onsite|Remote|Hybrid)$/.test(l));
  const seniorityLine = lines.find(l => /^(New Grad|Entry Level|New Grad, Entry Level)$/.test(l));

  const skillCandidates = ['Backend development', 'Frontend development', 'Full-stack',
    'Java', 'Python', 'Go', 'JavaScript', 'TypeScript', 'C++', 'C#', 'Rust', 'Swift',
    'Kotlin', 'APIs', 'REST services', 'GraphQL', 'Microservices', 'Data structures',
    'Algorithms', 'Distributed systems', 'Cloud platforms', 'AWS', 'Azure', 'GCP',
    'Kubernetes', 'Docker', 'SQL', 'NoSQL', '.NET', 'Spring', 'React', 'Vue',
    'Angular', 'Node.js', 'Machine Learning', 'Deep Learning', 'Linux'];
  const skills = skillCandidates.filter(s => lines.includes(s));

  return JSON.stringify({
    url: location.href,
    title: h1 ? h1.textContent.trim() : null,
    company,
    location: locLine,
    salary: salaryLine || 'Not listed',
    posted: postedLine,
    workMode: remoteLine,
    seniority: seniorityLine,
    match: matchMatch ? matchMatch[1] + '% ' + matchMatch[2] : null,
    h1b,
    exp: expLine || null,
    stage: stageLine || null,
    skills,
    extractedAt: new Date().toISOString(),
  });
})();
