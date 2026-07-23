'use strict';

class DomainError extends Error {
  constructor(message, code = 'DOMAIN_ERROR', status = 400) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.status = status;
  }
}

class NotFoundError extends DomainError {
  constructor(message = 'Not found') {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends DomainError {
  constructor(message = 'Conflict') {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
  }
}

module.exports = { DomainError, NotFoundError, ConflictError };
