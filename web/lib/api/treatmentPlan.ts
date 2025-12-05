/**
 * Treatment Plan API Client
 * Handles HTTP requests for treatment plan and goal management
 * Uses the shared API client with authentication and error handling
 */

import { get, post, put, del } from './client';
import type {
  TreatmentPlan,
  GetTreatmentPlansParams,
  GetTreatmentPlansResponse,
  CreateTreatmentPlanRequest,
  UpdateTreatmentPlanRequest,
  Goal,
  CreateGoalRequest,
  UpdateGoalRequest,
} from '../types/treatmentPlan';

/**
 * Treatment Plan API methods
 * Provides CRUD operations for treatment plans and their associated goals
 */
export const treatmentPlanApi = {
  /**
   * Fetch all treatment plans with optional filtering and pagination
   * @param params - Query parameters for filtering and pagination
   * @returns Promise resolving to paginated treatment plans
   */
  getAll: async (params?: GetTreatmentPlansParams): Promise<GetTreatmentPlansResponse> => {
    return await get<GetTreatmentPlansResponse>('/treatment-plans', { params });
  },

  /**
   * Fetch a single treatment plan by ID with nested goals
   * @param treatmentPlanId - UUID of the treatment plan
   * @returns Promise resolving to treatment plan with goals
   */
  getById: async (treatmentPlanId: string): Promise<TreatmentPlan> => {
    return await get<TreatmentPlan>(`/treatment-plans/${treatmentPlanId}`);
  },

  /**
   * Create a new treatment plan
   * @param data - Treatment plan creation data
   * @returns Promise resolving to created treatment plan
   */
  create: async (data: CreateTreatmentPlanRequest): Promise<TreatmentPlan> => {
    return await post<TreatmentPlan>('/treatment-plans', data);
  },

  /**
   * Update an existing treatment plan
   * @param treatmentPlanId - UUID of the treatment plan to update
   * @param data - Partial treatment plan data to update
   * @returns Promise resolving to updated treatment plan
   */
  update: async (
    treatmentPlanId: string,
    data: UpdateTreatmentPlanRequest
  ): Promise<TreatmentPlan> => {
    return await put<TreatmentPlan>(
      `/treatment-plans/${treatmentPlanId}`,
      data
    );
  },

  /**
   * Delete a treatment plan
   * @param treatmentPlanId - UUID of the treatment plan to delete
   * @returns Promise resolving when deletion is complete
   */
  delete: async (treatmentPlanId: string): Promise<void> => {
    await del(`/treatment-plans/${treatmentPlanId}`);
  },

  /**
   * Add a new goal to a treatment plan
   * @param treatmentPlanId - UUID of the parent treatment plan
   * @param data - Goal creation data
   * @returns Promise resolving to created goal
   */
  addGoal: async (treatmentPlanId: string, data: CreateGoalRequest): Promise<Goal> => {
    return await post<Goal>(
      `/treatment-plans/${treatmentPlanId}/goals`,
      data
    );
  },

  /**
   * Update an existing goal within a treatment plan
   * @param treatmentPlanId - UUID of the parent treatment plan
   * @param goalId - UUID of the goal to update
   * @param data - Partial goal data to update
   * @returns Promise resolving to updated goal
   */
  updateGoal: async (
    treatmentPlanId: string,
    goalId: string,
    data: UpdateGoalRequest
  ): Promise<Goal> => {
    return await put<Goal>(
      `/treatment-plans/${treatmentPlanId}/goals/${goalId}`,
      data
    );
  },

  /**
   * Delete a goal from a treatment plan
   * @param treatmentPlanId - UUID of the parent treatment plan
   * @param goalId - UUID of the goal to delete
   * @returns Promise resolving when deletion is complete
   */
  deleteGoal: async (treatmentPlanId: string, goalId: string): Promise<void> => {
    await del(`/treatment-plans/${treatmentPlanId}/goals/${goalId}`);
  },
};
