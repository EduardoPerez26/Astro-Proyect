// conciliacion-popeyes.js

function generarConciliacionPopeyes() {

    if (!salesWorkbook) {
        Swal.fire('Error', 'No hay archivo Popeyes cargado', 'error');
        return;
    }

    const sheet = salesWorkbook.Sheets[salesWorkbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: 0 });

    if (!rows.length) {
        Swal.fire('Error', 'No se encontraron registros', 'error');
        return;
    }

    const grupos = {};

    rows.forEach(row => {
        const fecha = normalizarFecha(row['Accounting Date']);
        const store = row['Unit Number'];
        const key = `${fecha}_${store}`;

        if (!grupos[key]) {
            grupos[key] = {
                fecha,
                store,
                unitName: row['Unit Name'],
                registros: []
            };
        }

        grupos[key].registros.push(row);
    });

    function monto(grupo, cuenta) {
        return grupo.registros
            .filter(r => r['Account'] === cuenta)
            .reduce((sum, r) => sum + (Number(r['Credit Amount']) || 0) - (Number(r['Debit Amount']) || 0), 0);
    }

    datosExtraidos = Object.values(grupos).map(grupo => {
        const calcular = cuenta => monto(grupo, cuenta);

        const food = calcular('Net Sales - Food');
        const beverage = calcular('Net Sales - Beverages');
        const other = calcular('Net Sales - Other');
        const serviceFee = calcular('Tips & Service Charges');
        const salesTax = calcular('Sales Tax Payable');
        const taxExemptSales = calcular('Tax Exempt Sales');
        const deliveryFee = calcular('Delivery Fee');
        const deliveryFeeNet = calcular('Delivery Fees Net');
        const deliveryTipsNet = calcular('Delivery Tips Net');
        const discounts = calcular('Promotions - Other') + calcular('Promotions - Wraps');
        const gcSold = calcular('Revenues - Gift Card Sales');
        const netSales = food + beverage + other;
        const totalRevenue = netSales + salesTax + gcSold;
        const mastercard = calcular('Payments - Master Card');
        const visa = calcular('Payments - Visa');
        const amex = calcular('Payments - AMEX');
        const discover = calcular('Payments - Discover');
        const debit = calcular('Payments - Debit');
        const dd = calcular('Payments - Door Dash');
        const gh = calcular('Payments - Grub Hub');
        const uber = calcular('Payments - Uber Eats');
        const ebt = calcular('Payments - EBT');
        const gcRedeem = calcular('Payments - Gift Card');
        const cashApp = calcular('Payments - Cash App');
        const kiosk = calcular('Payments - Kiosk') + calcular('Payments - Kiosk Visa') + calcular('Payments - Kiosk MasterCard') + calcular('Payments - Kiosk Discover');
        const cashDeposit = calcular('Cash Deposit');
        const cashOverShort = calcular('Cash Handling - Over/Short');
        const cashExpected = cashDeposit + cashOverShort;
        const paymentsTotal = mastercard + visa + amex + discover + debit + dd + gh + uber + ebt + gcRedeem + cashApp + kiosk;
        const difference = totalRevenue - paymentsTotal;

        return {
            fecha: grupo.fecha,
            store: grupo.store,
            unitName: grupo.unitName,
            food,
            beverage,
            other,
            serviceFee,
            salesTax,
            taxExemptSales,
            deliveryFee,
            deliveryFeeNet,
            deliveryTipsNet,
            discounts,
            gcSold,
            netSales,
            totalRevenue,
            mastercard,
            visa,
            amex,
            discover,
            debit,
            dd,
            gh,
            uber,
            ebt,
            gcRedeem,
            cashApp,
            kiosk,
            cashDeposit,
            cashOverShort,
            cashExpected,
            paymentsTotal,
            difference
        };
    });

    document.getElementById('resultsSection').style.display = 'block';
    renderTablaSucursales();
    actualizarResumen();
    actualizarTotales();
}



