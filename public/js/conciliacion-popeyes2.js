let popeyesConciliationData = [];
let popeyesTaxReviewData = [];
let popeyesDailySalesRedData = [];
let popeyesDailySales0404Data = [];

function generarStoreDatesPopeyes(
    salesPosRows
) {

    const stores =
        [...new Set(
            salesPosRows
                .map(r =>
                    Number(r.store)
                )
                .filter(Boolean)
        )]
        .sort((a, b) => a - b);

    const dates =
        [...new Set(
            salesPosRows
                .map(r => r.accountingDate)
                .filter(
                    d =>
                        d &&
                        d !== 0 &&
                        d !== 'Accounting Date'
                )
        )]
        .sort(
            (a, b) =>
                new Date(a) -
                new Date(b)
        );

    const storeDates = [];

    stores.forEach(store => {

        dates.forEach(date => {

            storeDates.push({

                store,

                date

            });

        });

    });

    return storeDates;

}

