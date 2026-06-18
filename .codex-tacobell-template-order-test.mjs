import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ console });

vm.runInContext(
  fs.readFileSync('./public/js/conciliacion-tacobell.js', 'utf8'),
  context
);

const output = vm.runInContext(`
  ordenarDepositosTacoBellAlFinal([
    { lineNo: 1, memo: 'Gross Food Sales', locationId: 28841 },
    { lineNo: 2, memo: 'Cash Expected Deposit', locationId: 28841 },
    { lineNo: 3, memo: 'EBT Expected Deposit', locationId: 28841 },
    { lineNo: 4, memo: 'Cash Expected Deposit', locationId: 32932 },
    { lineNo: 5, memo: 'Cash Expected Deposit', locationId: 28843 },
    { lineNo: 6, memo: 'DoorDash', locationId: 28843 },
    { lineNo: 7, memo: 'EBT Expected Deposit', locationId: 28843 },
    { lineNo: 8, memo: 'Cash Expected Deposit', locationId: 30491 }
  ])
`, context);

const order = output.map(row =>
  `${row.memo}:${row.locationId}`
);

const expected = [
  'Gross Food Sales:28841',
  'Cash Expected Deposit:32932',
  'DoorDash:28843',
  'Cash Expected Deposit:28841',
  'Cash Expected Deposit:28843',
  'Cash Expected Deposit:30491',
  'EBT Expected Deposit:28841',
  'EBT Expected Deposit:28843'
];

console.log(JSON.stringify(output, null, 2));

if (
  JSON.stringify(order) !== JSON.stringify(expected) ||
  output.some((row, index) => row.lineNo !== index + 1)
) {
  process.exitCode = 1;
}
