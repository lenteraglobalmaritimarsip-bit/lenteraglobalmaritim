import ExcelJS from 'exceljs';
import { ChartOfAccount } from '../types';

export const addChartOfAccountsWorksheet = (
  workbook: ExcelJS.Workbook,
  accounts: ChartOfAccount[],
): void => {
  const sheet = workbook.addWorksheet('Master COA');
  sheet.addRow(['ID Internal', 'Kode COA', 'Nama Akun', 'Kelompok Akun', 'Status']);
  [...accounts]
    .sort((first, second) => first.code.localeCompare(second.code) || first.accountDesc.localeCompare(second.accountDesc))
    .forEach((account) => sheet.addRow([
      account.id,
      account.code,
      account.accountDesc,
      account.accountGroup,
      account.isActive ? 'Aktif' : 'Nonaktif',
    ]));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: 'E1' };
  sheet.columns = [{ width: 18 }, { width: 16 }, { width: 48 }, { width: 28 }, { width: 14 }];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
};
