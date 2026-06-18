import fs from 'node:fs';
import vm from 'node:vm';

const noopElement = {
  addEventListener() {},
  style: {},
  classList: { add() {}, remove() {}, toggle() {} },
};
const context = vm.createContext({
  console,
  window: {},
  document: {
    addEventListener() {},
    getElementById() { return noopElement; },
    querySelectorAll() { return []; },
  },
});

vm.runInContext(
  fs.readFileSync('./public/js/conciliacion.js', 'utf8'),
  context
);

const output = vm.runInContext(`
  ({
    lineNo: serializarValorCSV(1, 'lineNo'),
    journal: serializarValorCSV('SJ', 'journal'),
    date: serializarValorCSV('06/16/2026', 'date'),
    memo: serializarValorCSV('Cash Expected Deposit', 'memo'),
    accountNumber: serializarValorCSV('102500', 'acctNo'),
    location: serializarValorCSV(2902, 'locationId'),
    debit: serializarValorCSV(59.56, 'debit'),
    oneDecimal: serializarValorCSV(1.2, 'credit'),
    zero: serializarValorCSV(0, 'debit'),
    empty: serializarValorCSV('', 'credit'),
    escapedText: serializarValorCSV('Discounts, "Manager"', 'memo')
  })
`, context);

console.log(JSON.stringify(output, null, 2));

if (
  output.lineNo !== '1' ||
  output.journal !== 'SJ' ||
  output.date !== '06/16/2026' ||
  output.memo !== 'Cash Expected Deposit' ||
  output.accountNumber !== '102500' ||
  output.location !== '2902' ||
  output.debit !== '59.56' ||
  output.oneDecimal !== '1.20' ||
  output.zero !== '0.00' ||
  output.empty !== '' ||
  output.escapedText !== '"Discounts, ""Manager"""'
) {
  process.exitCode = 1;
}
