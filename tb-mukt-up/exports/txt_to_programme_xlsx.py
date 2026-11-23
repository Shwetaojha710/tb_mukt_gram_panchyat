from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from pathlib import Path

out = Path(__file__).with_name('Programme_Logins_GM_DGM_STC_UPTSU.xlsx')

wb = Workbook()
ws = wb.active
ws.title = 'Programme Logins'

ws['A1'] = 'TB Mukt Gram Panchayat — Programme login credentials'
ws['A1'].font = Font(name='Arial', bold=True, size=14, color='0B4F8A')
ws.merge_cells('A1:E1')
ws['A2'] = 'Website'
ws['B2'] = 'https://tbmukht.demoquaeretech.in'
ws['A3'] = 'Role'
ws['B3'] = 'STATE (full state dashboard access)'
ws['A4'] = 'Generated'
ws['B4'] = '2026-11-17'
for r in range(2, 5):
    ws[f'A{r}'].font = Font(name='Arial', bold=True, size=10)
    ws[f'B{r}'].font = Font(name='Arial', size=10)

headers = ['S.No', 'Designation', 'LoginId', 'Password', 'Role']
header_fill = PatternFill('solid', fgColor='0B4F8A')
header_font = Font(name='Arial', bold=True, color='FFFFFF', size=11)
thin = Border(
    left=Side(style='thin', color='CBD5E1'),
    right=Side(style='thin', color='CBD5E1'),
    top=Side(style='thin', color='CBD5E1'),
    bottom=Side(style='thin', color='CBD5E1'),
)
for col, h in enumerate(headers, 1):
    cell = ws.cell(6, col, h)
    cell.fill = header_fill
    cell.font = header_font
    cell.alignment = Alignment(horizontal='center')
    cell.border = thin

rows = [
    (1, 'GM, NHM', 'GMNHM001', 'GQLCXY3EKA', 'STATE'),
    (2, 'DGM, NHM', 'DGMNHM001', 'VZ7W6PSTSX', 'STATE'),
    (3, 'STC', 'STCUP001', 'NUEF9ZMHAU', 'STATE'),
    (4, 'UPTSU', 'UPTSU001', 'WTKD8BD98D', 'STATE'),
]
body = Font(name='Arial', size=11)
bold = Font(name='Arial', bold=True, size=11)
alt = PatternFill('solid', fgColor='F8FAFC')
for i, row in enumerate(rows):
    for col, val in enumerate(row, 1):
        cell = ws.cell(7 + i, col, val)
        cell.font = bold if col in (3, 4) else body
        cell.border = thin
        cell.alignment = Alignment(horizontal='center' if col in (1, 3, 4, 5) else 'left')
        if i % 2:
            cell.fill = alt

ws['A12'] = 'Password change'
ws['A12'].font = Font(name='Arial', bold=True, size=11, color='0F766E')
ws['A13'] = 'After login, open "Change password" in the left sidebar (above Logout).'
ws['A14'] = 'Available for ALL logged-in users (State / District / Block / programme logins).'
ws['A15'] = 'Requires current password + new password (minimum 8 characters).'
ws['A16'] = 'Confidential — for authorised users only.'
ws['A16'].font = Font(name='Arial', italic=True, size=9, color='64748B')
for r in range(13, 16):
    ws[f'A{r}'].font = Font(name='Arial', size=10)
    ws.merge_cells(f'A{r}:E{r}')

ws.column_dimensions['A'].width = 8
ws.column_dimensions['B'].width = 16
ws.column_dimensions['C'].width = 14
ws.column_dimensions['D'].width = 14
ws.column_dimensions['E'].width = 12

wb.save(out)
print('Wrote', out)
