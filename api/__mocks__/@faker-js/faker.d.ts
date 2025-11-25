/**
 * Type declarations for custom faker mock
 */

export interface FakerMock {
  internet: {
    email: () => string;
    ipv4: () => string;
  };
  person: {
    firstName: () => string;
    lastName: () => string;
  };
  date: {
    birthdate: (options?: { min?: number; max?: number; mode?: string }) => Date;
  };
  string: {
    alphanumeric: (length: number) => string;
    uuid: () => string;
  };
  phone: {
    number: () => string;
  };
  location: {
    streetAddress: (includeSecondary?: boolean) => string;
  };
  helpers: {
    arrayElement: <T>(array: T[]) => T;
  };
}

export const faker: FakerMock;
