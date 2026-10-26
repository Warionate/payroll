// API Client & Interceptors
export { apiClient, setupInterceptors, resetInterceptorState, refreshSession } from './client';

// Domain-specific APIs
export { authApi, fetchCalendarToken, resetCalendarToken } from './auth';
export { chatApi } from './chat';
export {
  fetchFixedShifts,
  createFixedShift,
  deleteFixedShift,
  bulkSyncFixedShifts,
  applyFixedShifts,
} from './fixedShifts';
export { notificationsApi } from './notifications';
export {
  fetchPatterns,
  createPattern,
  updatePattern,
  deletePattern,
  setPatternArchived,
  createSlot,
  createBulkSlots,
  updateSlot,
  deleteSlot,
  fetchPatternAssignments,
  createPatternAssignment,
  deletePatternAssignment,
} from './patterns';
export { fetchRates, createRate, updateRate, deleteRate } from './rates';
export {
  fetchSalaryAdjustments,
  createSalaryAdjustment,
  updateSalaryAdjustment,
  deleteSalaryAdjustment,
} from './salaryAdjustments';
export { uploadsApi, pdfApi } from './uploads';
export {
  fetchUsers,
  deleteUser,
  updateUserProfile,
  updateUserLoginId,
  resetUserMfa,
  updateUserPassword,
  updateUserRole,
} from './users';
export {
  fetchScheduleEvents,
  createScheduleEvent,
  updateScheduleEvent,
  deleteScheduleEvent,
} from './scheduleEvents';
export {
  fetchWorkLogs,
  createWorkLog,
  updateWorkLog,
  deleteWorkLog,
  updateWorkLogStatus,
  saveDailyClasses,
  completeAllWorkLogs,
} from './workLogs';

// Default export: the configured axios instance (backward compatibility)
import { apiClient } from './client';
export default apiClient;
