/**
 * Generate user-friendly SOP (Word) for TB Mukt Gram Panchayat portal — English.
 */
const path = require('path');
const fs = require('fs');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
  LevelFormat,
  Header,
  Footer,
  PageNumber,
} = require('docx');

const OUT = path.join(__dirname, 'TB_Mukt_Gram_Panchayat_SOP_English.docx');
const WEBSITE = 'https://tbmukht.demoquaeretech.in';

const border = { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(text, opts = {}) {
  const {
    bold = false,
    fill = null,
    width = 2340,
    color = '0F172A',
    align = AlignmentType.LEFT,
  } = opts;
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, fill } : undefined,
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text: String(text ?? ''),
            bold,
            size: 20,
            font: 'Calibri',
            color,
          }),
        ],
      }),
    ],
  });
}

function headerRow(labels, widths) {
  return new TableRow({
    children: labels.map((t, i) =>
      cell(t, { bold: true, fill: '0B4F8A', color: 'FFFFFF', width: widths[i] })
    ),
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 140, before: opts.before ?? 0 },
    alignment: opts.align,
    children: [
      new TextRun({
        text,
        size: opts.size || 22,
        font: 'Calibri',
        bold: !!opts.bold,
        color: opts.color || '1E293B',
        italics: !!opts.italics,
      }),
    ],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true, size: 32, font: 'Calibri', color: '0B4F8A' })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 220, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, font: 'Calibri', color: '0F766E' })],
  });
}

function bullet(text, ref = 'bullets') {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 21, font: 'Calibri', color: '1E293B' })],
  });
}

function step(n, text) {
  return new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({ text: `Step ${n}: `, bold: true, size: 21, font: 'Calibri', color: '0B4F8A' }),
      new TextRun({ text, size: 21, font: 'Calibri', color: '1E293B' }),
    ],
  });
}

const W = [1800, 2200, 2200, 3160];
const W3 = [3120, 3120, 3120];
const W2 = [4680, 4680];
const Wcred = [2400, 2800, 2800, 1360];

async function main() {
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 420, hanging: 240 } } },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          styles: [{ id: 'Normal', run: { font: 'Calibri', size: 22 } }],
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'TB Mukt Gram Panchayat · Uttar Pradesh  |  User SOP',
                    size: 18,
                    font: 'Calibri',
                    color: '64748B',
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'Page ', size: 16, color: '64748B', font: 'Calibri' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '64748B', font: 'Calibri' }),
                  new TextRun({
                    text: '  ·  Confidential — for authorised users only',
                    size: 16,
                    color: '64748B',
                    font: 'Calibri',
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: 'STANDARD OPERATING PROCEDURE (SOP)',
                bold: true,
                size: 36,
                font: 'Calibri',
                color: '0B4F8A',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: 'TB Mukt Gram Panchayat Portal — Uttar Pradesh',
                bold: true,
                size: 28,
                font: 'Calibri',
                color: '0F172A',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: 'Simple user guide for State, District and Block logins',
                size: 22,
                font: 'Calibri',
                color: '475569',
              }),
            ],
          }),

          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: W2,
            rows: [
              new TableRow({
                children: [
                  cell('Website (Login URL)', {
                    bold: true,
                    fill: 'ECFDF5',
                    width: 4680,
                    color: '065F46',
                  }),
                  cell(WEBSITE, { bold: true, fill: 'ECFDF5', width: 4680, color: '065F46' }),
                ],
              }),
              new TableRow({
                children: [
                  cell('Open in Chrome or Edge', { width: 4680, fill: 'F8FAFC' }),
                  cell('Bookmark this link for daily use', { width: 4680, fill: 'F8FAFC' }),
                ],
              }),
            ],
          }),

          p(
            'This document explains which login to use for which work, how to sign in, and what screens each role can see.',
            { before: 200, after: 160 }
          ),

          h1('1. Three login types — quick summary'),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: W,
            rows: [
              headerRow(['Login type', 'Who uses it', 'Main work', 'Geography'], W),
              new TableRow({
                children: [
                  cell('STATE', { bold: true, width: W[0], fill: 'DBEAFE' }),
                  cell('State / NHM / programme team', { width: W[1] }),
                  cell('Full UP dashboard, settings, monitoring', { width: W[2] }),
                  cell('Entire Uttar Pradesh', { width: W[3] }),
                ],
              }),
              new TableRow({
                children: [
                  cell('DISTRICT', { bold: true, width: W[0], fill: 'FEF3C7' }),
                  cell('District / CMO / DTO team', { width: W[1] }),
                  cell('Own district dashboard & monitoring', { width: W[2] }),
                  cell('Own District only (locked)', { width: W[3] }),
                ],
              }),
              new TableRow({
                children: [
                  cell('BLOCK', { bold: true, width: W[0], fill: 'FCE7F3' }),
                  cell('Block / CHC / field data-entry user', { width: W[1] }),
                  cell('Monthly TB Entry + Block dashboard', { width: W[2] }),
                  cell('Own Block only (locked)', { width: W[3] }),
                ],
              }),
            ],
          }),

          h1('2. Website and common login steps'),
          step(1, `Open this link in your browser: ${WEBSITE}`),
          step(2, 'On the login page, enter Username (LoginId) and Password.'),
          step(3, 'Click Login. If the password is wrong, you will see an error — check Caps Lock.'),
          step(4, 'Use the left sidebar for menus. Always log out from the profile area at the bottom.'),
          p('Tip: When copying and pasting the password, do not leave extra spaces.', {
            italics: true,
            color: '64748B',
          }),

          h1('3. STATE login — what you can do'),
          h2('3.1 Access'),
          bullet('You can view data for the entire Uttar Pradesh.'),
          bullet('You can drill down using District / Block filters.'),
          bullet('TB Entry Settings (last date / entry window) are managed by the State user.'),
          h2('3.2 Menus (sidebar)'),
          bullet('Dashboard Overview — State / District / Block level KPIs (by filters)'),
          bullet('State Dashboard — detailed line list + Excel download'),
          bullet('TB Entry Settings — entry window / last dates'),
          h2('3.3 Typical daily flow'),
          step(1, 'Log in → open Dashboard Overview.'),
          step(2, 'Choose From–To month → click Apply.'),
          step(3, 'Check Qualified / Gold–Silver–Bronze / Pending cards.'),
          step(4, 'Click a district in the table (or select District in filters) to drill down.'),
          step(5, 'Use Download Data (Excel) to export the report.'),
          h2('3.4 Demo STATE credentials'),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: W3,
            rows: [
              headerRow(['LoginId', 'Password', 'Role'], W3),
              new TableRow({
                children: [
                  cell('STU933468', { bold: true, width: W3[0] }),
                  cell('JH7D4AP3', { bold: true, width: W3[1] }),
                  cell('STATE · State User', { width: W3[2] }),
                ],
              }),
            ],
          }),

          h1('4. DISTRICT login — what you can do'),
          h2('4.1 Access'),
          bullet('Only your own District is shown (district filter is locked / fixed).'),
          bullet('You can choose a Block to view block-level data.'),
          bullet('Data entry is done by the Block user — District mainly monitors.'),
          h2('4.2 Menus'),
          bullet('Dashboard Overview — district / block filters'),
          bullet('District Dashboard — district line list + table export'),
          h2('4.3 Typical flow'),
          step(1, 'Log in → open District Dashboard / Overview.'),
          step(2, 'Set the period (From–To) and click Apply.'),
          step(3, 'Review Qualified GPs, medals, and pending above 50.'),
          step(4, 'Use the Block filter to identify weak blocks.'),
          step(5, 'Export Excel and share with the district team.'),
          h2('4.4 Sample DISTRICT credentials'),
          p('The full list of 75 districts is in a separate Excel file (see Section 7). Common samples below:', {
            after: 120,
          }),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: Wcred,
            rows: [
              headerRow(['District', 'LoginId', 'Password', 'Type'], Wcred),
              new TableRow({
                children: [
                  cell('Hardoi', { width: Wcred[0] }),
                  cell('MA997782', { bold: true, width: Wcred[1] }),
                  cell('BDECA4', { bold: true, width: Wcred[2] }),
                  cell('District User', { width: Wcred[3] }),
                ],
              }),
              new TableRow({
                children: [
                  cell('Agra', { width: Wcred[0] }),
                  cell('IH640880', { bold: true, width: Wcred[1] }),
                  cell('401225', { bold: true, width: Wcred[2] }),
                  cell('District User', { width: Wcred[3] }),
                ],
              }),
              new TableRow({
                children: [
                  cell('Lucknow', { width: Wcred[0] }),
                  cell('IH729487', { bold: true, width: Wcred[1] }),
                  cell('848622', { bold: true, width: Wcred[2] }),
                  cell('District User', { width: Wcred[3] }),
                ],
              }),
              new TableRow({
                children: [
                  cell('Varanasi', { width: Wcred[0] }),
                  cell('CDO994932', { bold: true, width: Wcred[1] }),
                  cell('D326B1', { bold: true, width: Wcred[2] }),
                  cell('District User', { width: Wcred[3] }),
                ],
              }),
              new TableRow({
                children: [
                  cell('Kanpur Nagar', { width: Wcred[0] }),
                  cell('DFP599362', { bold: true, width: Wcred[1] }),
                  cell('FED73E', { bold: true, width: Wcred[2] }),
                  cell('District User', { width: Wcred[3] }),
                ],
              }),
              new TableRow({
                children: [
                  cell('Ghaziabad', { width: Wcred[0] }),
                  cell('DFP250159', { bold: true, width: Wcred[1] }),
                  cell('EB1E87', { bold: true, width: Wcred[2] }),
                  cell('District User', { width: Wcred[3] }),
                ],
              }),
            ],
          }),

          h1('5. BLOCK login — what you can do'),
          h2('5.1 Access'),
          bullet('Only your own Block is shown (District + Block locked).'),
          bullet('This role performs monthly TB data entry.'),
          bullet('Select a Gram Panchayat and fill the form for the chosen month/year.'),
          h2('5.2 Menus'),
          bullet('Dashboard Overview / Block Dashboard — GPs in your block'),
          bullet('TB Entry — create / edit monthly form'),
          bullet('TB Entry List — previously saved / submitted entries'),
          h2('5.3 TB Entry — simple steps'),
          step(1, 'Open the TB Entry menu.'),
          step(2, 'Select Gram Panchayat (District/Block are already locked).'),
          step(3, 'Choose Reporting Month and Year.'),
          step(4, 'Enter numbers: NAAT tested, Diagnosed, Treatment success %, Poshan fields.'),
          step(5, 'Save Draft (incomplete) or Submit (final). Same GP + Month + Year cannot be duplicated.'),
          p('Remember these rules:', { bold: true, before: 120 }),
          bullet('Diagnosed ≤ Tested'),
          bullet('Poshan Eligible ≤ Diagnosed; Consented ≤ Eligible; Received ≤ Consented'),
          bullet('Treatment success % must be between 0 and 100'),
          h2('5.4 When is a GP “Qualified”?'),
          bullet('Testing rate ≥ 30 per 1,000 population'),
          bullet('Detection rate ≤ 1 per 1,000 population'),
          bullet('Treatment success > 90%'),
          bullet('Poshan received = consented (100%)'),
          p('If any one rule fails → Not Qualified.', { italics: true, color: 'B45309' }),
          h2('5.5 Sample BLOCK credentials (Hardoi)'),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: Wcred,
            rows: [
              headerRow(['Block', 'LoginId', 'Password', 'Type'], Wcred),
              new TableRow({
                children: [
                  cell('Bawan', { width: Wcred[0] }),
                  cell('BLU119665', { bold: true, width: Wcred[1] }),
                  cell('AB45FG93', { bold: true, width: Wcred[2] }),
                  cell('Block User', { width: Wcred[3] }),
                ],
              }),
              new TableRow({
                children: [
                  cell('Harpalpur (Harpalur)', { width: Wcred[0] }),
                  cell('BLU120256', { bold: true, width: Wcred[1] }),
                  cell('AC67UT92', { bold: true, width: Wcred[2] }),
                  cell('Block User', { width: Wcred[3] }),
                ],
              }),
              new TableRow({
                children: [
                  cell('Kothwan (Kothawan)', { width: Wcred[0] }),
                  cell('BLU120463', { bold: true, width: Wcred[1] }),
                  cell('AC67UT95', { bold: true, width: Wcred[2] }),
                  cell('Block User', { width: Wcred[3] }),
                ],
              }),
              new TableRow({
                children: [
                  cell('Sandi', { width: Wcred[0] }),
                  cell('BLU120838', { bold: true, width: Wcred[1] }),
                  cell('AV34GA89', { bold: true, width: Wcred[2] }),
                  cell('Block User', { width: Wcred[3] }),
                ],
              }),
            ],
          }),

          h1('6. TB Unit (TU) login — short note'),
          bullet('LoginId pattern: TBU + Facility Code (example: TBU23841)'),
          bullet('User type: TBUnitfacilityType'),
          bullet(
            'Full TU list is in Excel: All_District_and_TU_Logins_2026-10-21.xlsx → sheet “TB Unit Logins”'
          ),
          p('Example: Agra · CHC Achhnera → LoginId TBU23841 · Password ZB5JRERC', {
            before: 80,
          }),

          h1('7. Full credentials file (all districts + TUs)'),
          p('Folder path on project / shared drive:'),
          p('tb-mukt-up/exports/All_District_and_TU_Logins_2026-10-21.xlsx', {
            bold: true,
            color: '0B4F8A',
          }),
          bullet('Sheet “District Logins” — 75 districts (LoginId + Password)'),
          bullet('Sheet “TB Unit Logins” — 1,100+ TU logins'),
          bullet('This SOP includes only demo / sample credentials — use the Excel for the rest'),

          h1('8. Do’s and Don’ts'),
          bullet('Do: Keep your password safe; log out and close the browser on shared PCs.'),
          bullet('Do: Double-check numbers before Submit.'),
          bullet('Don’t: Share another block/district login with anyone.'),
          bullet('Don’t: Post production credentials on WhatsApp or public groups.'),
          bullet('Don’t: Submit twice for the same GP for the same month-year.'),

          h1('9. Quick troubleshooting'),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: W2,
            rows: [
              headerRow(['Problem', 'What to do'], W2),
              new TableRow({
                children: [
                  cell('Cannot log in', { width: W2[0] }),
                  cell('Check Caps Lock / extra spaces; use the correct LoginId', { width: W2[1] }),
                ],
              }),
              new TableRow({
                children: [
                  cell('District / Block dropdown empty', { width: W2[0] }),
                  cell('Field may be locked for your role — refresh or re-login', {
                    width: W2[1],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  cell('Duplicate entry error', { width: W2[0] }),
                  cell('Open the existing entry in TB Entry List and edit it', { width: W2[1] }),
                ],
              }),
              new TableRow({
                children: [
                  cell('Excel download 404 / fails', { width: W2[0] }),
                  cell('Hard refresh; try Download Data from Dashboard Overview', {
                    width: W2[1],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  cell('Website does not open', { width: W2[0] }),
                  cell(`Confirm the URL: ${WEBSITE}`, { width: W2[1] }),
                ],
              }),
            ],
          }),

          h1('10. One-page cheat sheet'),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: W3,
            rows: [
              headerRow(['Role', 'Sample login', 'First screen'], W3),
              new TableRow({
                children: [
                  cell('STATE', { bold: true, width: W3[0], fill: 'DBEAFE' }),
                  cell('STU933468 / JH7D4AP3', { width: W3[1] }),
                  cell('Dashboard Overview + State Dashboard', { width: W3[2] }),
                ],
              }),
              new TableRow({
                children: [
                  cell('DISTRICT', { bold: true, width: W3[0], fill: 'FEF3C7' }),
                  cell('Hardoi MA997782 / BDECA4', { width: W3[1] }),
                  cell('Dashboard Overview + District Dashboard', { width: W3[2] }),
                ],
              }),
              new TableRow({
                children: [
                  cell('BLOCK', { bold: true, width: W3[0], fill: 'FCE7F3' }),
                  cell('Sandi BLU120838 / AV34GA89', { width: W3[1] }),
                  cell('TB Entry + Block Dashboard', { width: W3[2] }),
                ],
              }),
            ],
          }),

          p(`Website: ${WEBSITE}`, { bold: true, before: 240, after: 60 }),
          p(`Document date: ${new Date().toLocaleDateString('en-IN')}  ·  Version 1.1 (English)`, {
            color: '64748B',
            size: 18,
          }),
        ],
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(OUT, buf);
  console.log('Wrote', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
