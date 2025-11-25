/**
 * Simple faker mock for testing
 * Provides basic fake data generation without ES modules issues
 */

export const faker = {
  internet: {
    email: () => `test${Math.random().toString(36).substring(7)}@example.com`,
    ipv4: () => `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
  },
  person: {
    firstName: () => ['John', 'Jane', 'Michael', 'Sarah', 'David'][Math.floor(Math.random() * 5)],
    lastName: () => ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'][Math.floor(Math.random() * 5)],
  },
  date: {
    birthdate: (options?: { min?: number; max?: number; mode?: string }) => {
      const year = 2000 - Math.floor(Math.random() * 50);
      const month = Math.floor(Math.random() * 12) + 1;
      const day = Math.floor(Math.random() * 28) + 1;
      return new Date(year, month, day);
    },
  },
  string: {
    alphanumeric: (length: number) => {
      return Array.from({ length }, () =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
      ).join('');
    },
    uuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    }),
  },
  phone: {
    number: () => `555-${Math.floor(1000 + Math.random() * 9000)}`,
  },
  location: {
    streetAddress: (includeSecondary?: boolean) => {
      const num = Math.floor(Math.random() * 9999) + 1;
      const street = ['Main St', 'Oak Ave', 'Pine Dr', 'Elm Rd'][Math.floor(Math.random() * 4)];
      return `${num} ${street}`;
    },
  },
  helpers: {
    arrayElement: <T>(array: T[]) => array[Math.floor(Math.random() * array.length)],
  },
};
