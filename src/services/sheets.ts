export const getSalesData = async (): Promise<string> => {
  // In a real scenario, this would authenticate using ADC and fetch data from a Google Sheet
  // For the MVP, we return mock data
  return JSON.stringify([
    { product: 'Widget A', stock: 10, salesYesterday: 5 },
    { product: 'Widget B', stock: 2, salesYesterday: 20 },
  ]);
};
