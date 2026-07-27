/**
 * Global groupBy function that groups array elements by a key
 * @param {Array} array - The array to group
 * @param {Function|String} key - The key to group by (either property name or function)
 * @returns {Object} An object with keys as group names and values as arrays of grouped items
 */
export const groupBy = function (array, key) {
  // Return empty object for invalid inputs
  if (!Array.isArray(array) || array.length === 0) {
    return {};
  }

  // Normalize the key function
  const keyFn = typeof key === 'function' ? key : (item) => item[key];

  // Perform the grouping
  return array.reduce((result, item) => {
    const groupKey = keyFn(item);

    // Skip null/undefined keys
    if (groupKey === null || groupKey === undefined) {
      return result;
    }

    // Create the group if it doesn't exist
    if (!result[groupKey]) {
      result[groupKey] = [];
    }

    // Add the item to its group
    result[groupKey].push(item);
    return result;
  }, {});
};

/**
 * Groups array elements by date, ignoring the time component
 * @param {Array} array - The array to group
 * @param {String|Function} dateField - The field containing the date or a function returning a Date
 * @param {Object} options - Additional options
 * @param {String} [options.format='YYYY-MM-DD'] - The output format for the date key
 * @returns {Object} An object with dates as keys and values as arrays of grouped items
 */
export const groupByDate = function (array, dateField, options = {}) {
  // Default options
  const opts = {
    format: 'YYYY-MM-DD',
    ...options,
  };

  return groupBy(array, (item) => {
    // Get the date value
    let dateValue;
    if (typeof dateField === 'function') {
      dateValue = dateField(item);
    } else {
      dateValue = item[dateField];
    }

    // Handle different date input types
    let date;
    if (dateValue instanceof Date) {
      date = dateValue;
    } else if (typeof dateValue === 'string' || typeof dateValue === 'number') {
      date = new Date(dateValue);
    } else {
      // Skip items with invalid dates
      return null;
    }

    // Skip invalid dates
    if (isNaN(date.getTime())) {
      return null;
    }

    // Format the date as YYYY-MM-DD (ignoring time component)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    // Return the formatted date based on the specified format
    if (opts.format === 'YYYY-MM-DD') {
      return `${year}-${month}-${day}`;
    } else if (opts.format === 'MM/DD/YYYY') {
      return `${month}/${day}/${year}`;
    } else if (opts.format === 'DD/MM/YYYY') {
      return `${day}/${month}/${year}`;
    } else {
      return `${year}-${month}-${day}`; // Default to ISO format
    }
  });
};

// Example of how to use it:
//
// // Example 1: Group by a property
// const people = [
//   { name: 'Alice', age: 25 },
//   { name: 'Bob', age: 30 },
//   { name: 'Charlie', age: 25 },
//   { name: 'Dave', age: 30 }
// ];
//
// const groupedByAge = groupBy(people, 'age');
// console.log(groupedByAge);
// // Output:
// // {
// //   '25': [{ name: 'Alice', age: 25 }, { name: 'Charlie', age: 25 }],
// //   '30': [{ name: 'Bob', age: 30 }, { name: 'Dave', age: 30 }]
// // }
//
// // Example 2: Group by a function
// const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
// const groupedByEvenOdd = groupBy(numbers, num => num % 2 === 0 ? 'even' : 'odd');
// console.log(groupedByEvenOdd);
// // Output:
// // {
// //   'odd': [1, 3, 5, 7, 9],
// //   'even': [2, 4, 6, 8, 10]
// // }
//
// // Example 3: Group by date (ignoring time)
// const events = [
//   { name: 'Meeting', timestamp: '2023-05-15T09:30:00Z' },
//   { name: 'Lunch', timestamp: '2023-05-15T12:45:00Z' },
//   { name: 'Conference', timestamp: '2023-05-16T10:00:00Z' },
//   { name: 'Interview', timestamp: '2023-05-16T15:15:00Z' }
// ];
//
// const eventsByDate = groupByDate(events, 'timestamp');
// console.log(eventsByDate);
// // Output:
// // {
// //   '2023-05-15': [
// //     { name: 'Meeting', timestamp: '2023-05-15T09:30:00Z' },
// //     { name: 'Lunch', timestamp: '2023-05-15T12:45:00Z' }
// //   ],
// //   '2023-05-16': [
// //     { name: 'Conference', timestamp: '2023-05-16T10:00:00Z' },
// //     { name: 'Interview', timestamp: '2023-05-16T15:15:00Z' }
// //   ]
// // }
//
// // Example 4: Custom date format
// const salesByDate = groupByDate(sales, 'saleDate', { format: 'MM/DD/YYYY' });
// // Output keys will be in the format '05/15/2023', '05/16/2023', etc.
