import { PRDSheetData } from '../agents/prdGeneratorAgent';

function esc(s: string | number = ''): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Convert \n to <br> and escape HTML */
function cell(s: string | number = ''): string {
    return esc(s).replace(/\n/g, '<br>');
}

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Verdana, Geneva, sans-serif; font-size: 10pt; color: #000; background: #fff; padding: 24px; }
h1 { font-size: 13pt; text-align: center; background: #FCF3CF; padding: 10px; border: 1px solid #000; margin-bottom: 20px; }
h2 { font-size: 11pt; color: #D41349; background: #EBDEF0; padding: 6px 10px; border: 1px solid #000; margin: 28px 0 0 0; }
table { width: 100%; border-collapse: collapse; margin-top: 0; }
th { background: #D6EAF8; font-weight: bold; text-align: center; padding: 6px 8px; border: 1px solid #000; white-space: nowrap; }
td { padding: 6px 8px; border: 1px solid #000; vertical-align: top; }
tr.section-row td { background: #EBDEF0; color: #D41349; font-weight: bold; text-align: center; }
td.sno { text-align: center; font-weight: bold; white-space: nowrap; }
td.label { font-weight: normal; white-space: nowrap; }
.overview-table td.val { }
@media print {
  h2 { page-break-before: auto; }
  tr { page-break-inside: avoid; }
}
`;

function buildOverview(data: PRDSheetData): string {
    const rows: [string, string][] = [
        ['Feature Name', data.featureName || ''],
        ['Module', data.module || ''],
        ['Sub Module', data.subModule || ''],
        ['PM Owner', data.overview.pmOwner || ''],
        ['Developers', data.overview.developers || ''],
        ['UI Owner', data.overview.uiOwner || ''],
        ['QA Members', data.overview.qaMembers || ''],
        ['Documentation Owner', data.overview.documentationOwner || ''],
        ['Marketing Creatives Owner', ''],
        ['Marketing Video Owner', ''],
        ['Feature Analysis Document', ''],
        ['Flow Diagram / Wireframe (Figma)', ''],
        ['Design Space Link', ''],
        ['HTML Conversion Link', ''],
        ['Security / Compliance Co-ordinator', ''],
        ['Sample Workspace', ''],
        ['Connect Post Link', ''],
        ['Cliq Group', ''],
        ['Customer Feature Request Tag', ''],
        ['Build Number', ''],
    ];

    const rowsHtml = rows.map(([label, value]) =>
        `<tr><td class="label" style="width:220px">${esc(label)}</td><td class="val">${esc(value)}</td></tr>`
    ).join('\n');

    return `
<h2>Overview</h2>
<table class="overview-table">
  <thead><tr><th style="width:220px">Category</th><th>Details</th></tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>`;
}

function buildUseCases(data: PRDSheetData): string {
    const rowsHtml = data.useCases.map(uc => {
        if (uc.type === 'section') {
            return `<tr class="section-row"><td colspan="5">${esc(uc.sectionName)}</td></tr>`;
        }
        const raw = uc.useCase || '';
        const sepIndex = raw.indexOf(' — ');
        const hasSep = sepIndex !== -1;
        const category = hasSep ? raw.slice(0, sepIndex).trim() : raw;
        const subCase = hasSep ? raw.slice(sepIndex + 3).trim() : '';

        return `<tr>
  <td class="sno" style="width:60px">${esc(uc.sno)}</td>
  <td style="width:200px;font-weight:bold">${esc(category)}</td>
  <td style="width:160px">${esc(subCase)}</td>
  <td>${cell(uc.description)}</td>
  <td style="width:180px">${cell(uc.pmNotes)}</td>
</tr>`;
    }).join('\n');

    return `
<h2>Use Cases</h2>
<table>
  <thead><tr>
    <th style="width:60px">S.No</th>
    <th style="width:200px">Use Case</th>
    <th style="width:160px">Sub Case</th>
    <th>Description</th>
    <th style="width:180px">PM Notes</th>
  </tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>`;
}

function buildErrorHandling(data: PRDSheetData): string {
    if (!data.errorHandling.length) return '';

    const rowsHtml = data.errorHandling.map((err, i) =>
        `<tr>
  <td class="sno" style="width:50px">${i + 1}</td>
  <td style="width:220px">${esc(err.errorCase)}</td>
  <td>${cell(err.content)}</td>
</tr>`
    ).join('\n');

    return `
<h2>Error Handling</h2>
<table>
  <thead><tr><th style="width:50px">S.No</th><th style="width:220px">Error / Alert Case</th><th>Content</th></tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>`;
}

function buildAffectedAreas(data: PRDSheetData): string {
    if (!data.affectedAreas.length) return '';

    const rowsHtml = data.affectedAreas.map((area, i) =>
        `<tr>
  <td class="sno" style="width:45px">${i + 1}</td>
  <td style="width:120px">${esc(area.module)}</td>
  <td style="width:130px">${esc(area.subModule)}</td>
  <td>${cell(area.areasAffected)}</td>
  <td style="width:200px">${cell(area.dependency)}</td>
</tr>`
    ).join('\n');

    return `
<h2>Affected Areas</h2>
<table>
  <thead><tr>
    <th style="width:45px">S.No</th>
    <th style="width:120px">Module</th>
    <th style="width:130px">Sub Module</th>
    <th>Areas Affected</th>
    <th style="width:200px">Dependency to Check</th>
  </tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>`;
}

function buildLimitations(data: PRDSheetData): string {
    if (!data.limitations.length) return '';

    const rowsHtml = data.limitations.map((lim, i) =>
        `<tr>
  <td class="sno" style="width:50px;color:#002060">${i + 1}</td>
  <td>${cell(lim.limitation)}</td>
  <td>${cell(lim.comments)}</td>
</tr>`
    ).join('\n');

    return `
<h2>Limitations &amp; Roadmap</h2>
<table>
  <thead><tr>
    <th style="width:50px;color:#002060">S.No</th>
    <th>Limitations</th>
    <th>Comments</th>
  </tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>`;
}

export function writePRDHtml(data: PRDSheetData): string {
    const title = esc(data.featureName || 'PRD');
    const body = [
        buildOverview(data),
        buildUseCases(data),
        buildErrorHandling(data),
        buildAffectedAreas(data),
        buildLimitations(data),
    ].join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${CSS}</style>
</head>
<body>
  <h1>${title}</h1>
  ${body}
</body>
</html>`;
}
