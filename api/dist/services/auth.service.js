"use strict";
/**
 * Authentication Service
 *
 * Handles user authentication, password hashing, and JWT token management
 * Uses bcrypt for password hashing and jsonwebtoken for JWT tokens
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshToken = exports.getUserById = exports.login = exports.register = exports.verifyToken = exports.generateToken = exports.comparePassword = exports.hashPassword = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const database_1 = __importDefault(require("../config/database"));
const validation_1 = require("../utils/validation");
// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-replace-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m';
const BCRYPT_ROUNDS = 10;
/**
 * Hash password using bcrypt
 */
const hashPassword = async (password) => {
    return await bcrypt_1.default.hash(password, BCRYPT_ROUNDS);
};
exports.hashPassword = hashPassword;
/**
 * Compare password with hash
 */
const comparePassword = async (password, hash) => {
    return await bcrypt_1.default.compare(password, hash);
};
exports.comparePassword = comparePassword;
/**
 * Generate JWT token
 */
const generateToken = (userId, email, role) => {
    const payload = {
        userId,
        email,
        role
    };
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
};
exports.generateToken = generateToken;
/**
 * Verify and decode JWT token
 */
const verifyToken = (token) => {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        return decoded;
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            throw new Error('Token has expired');
        }
        else if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            throw new Error('Invalid token');
        }
        else {
            throw new Error('Token verification failed');
        }
    }
};
exports.verifyToken = verifyToken;
/**
 * Register a new user
 */
const register = async (email, password, role = client_1.Role.PATIENT) => {
    // Validate email format
    if (!(0, validation_1.validateEmail)(email)) {
        throw new Error('Invalid email format');
    }
    // Validate password strength
    const passwordValidation = (0, validation_1.validatePassword)(password);
    if (!passwordValidation.valid) {
        throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
    }
    // Check if user already exists
    const existingUser = await database_1.default.user.findUnique({
        where: { email: email.toLowerCase() }
    });
    if (existingUser) {
        throw new Error('Email already registered');
    }
    // Hash password
    const hashedPassword = await (0, exports.hashPassword)(password);
    // Create user
    const user = await database_1.default.user.create({
        data: {
            email: email.toLowerCase(),
            password: hashedPassword,
            role
        }
    });
    // Generate token
    const token = (0, exports.generateToken)(user.id, user.email, user.role);
    // Return user (without password) and token
    const { password: _, ...userResponse } = user;
    return {
        user: userResponse,
        token
    };
};
exports.register = register;
/**
 * Login user
 */
const login = async (email, password) => {
    // Find user by email
    const user = await database_1.default.user.findUnique({
        where: { email: email.toLowerCase() }
    });
    if (!user) {
        throw new Error('Invalid credentials');
    }
    // Verify password
    const isPasswordValid = await (0, exports.comparePassword)(password, user.password);
    if (!isPasswordValid) {
        throw new Error('Invalid credentials');
    }
    // Generate token
    const token = (0, exports.generateToken)(user.id, user.email, user.role);
    // Return user (without password) and token
    const { password: _, ...userResponse } = user;
    return {
        user: userResponse,
        token
    };
};
exports.login = login;
/**
 * Get user by ID (for token verification)
 */
const getUserById = async (userId) => {
    const user = await database_1.default.user.findUnique({
        where: { id: userId }
    });
    if (!user) {
        return null;
    }
    const { password: _, ...userResponse } = user;
    return userResponse;
};
exports.getUserById = getUserById;
/**
 * Refresh token (generate new token for existing user)
 */
const refreshToken = async (userId) => {
    const user = await database_1.default.user.findUnique({
        where: { id: userId }
    });
    if (!user) {
        throw new Error('User not found');
    }
    return (0, exports.generateToken)(user.id, user.email, user.role);
};
exports.refreshToken = refreshToken;
