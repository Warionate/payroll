/**
 * User Controller - handles HTTP request/response for user management
 */
import type { Request, Response } from 'express';
import { userService } from '../services/userService.js';

export const userController = {
  async getAll(req: Request, res: Response) {
    const rows = await userService.getAll();
    res.json(rows);
  },

  async delete(req: Request, res: Response) {
    const userId = parseInt(req.params.id as string, 10);
    const password = typeof req.body?.password === 'string' ? req.body.password : undefined;
    await userService.deleteUser(userId, req.user!, password);
    res.json({ message: 'deleted' });
  },

  async updateProfile(req: Request, res: Response) {
    const userId = parseInt(req.params.id as string, 10);
    userService.updateDisplayName(userId, req.body.display_name, req.user!);
    res.json({ message: 'updated' });
  },

  resetMfa(req: Request, res: Response) {
    userService.resetMfa(parseInt(req.params.id as string, 10), req.user!);
    res.json({ message: 'reset' });
  },

  async updateLoginId(req: Request, res: Response) {
    const userId = parseInt(req.params.id as string, 10);
    userService.updateLoginId(userId, req.body.username, req.user!);
    res.json({ message: 'updated' });
  },

  async updatePassword(req: Request, res: Response) {
    const userId = parseInt(req.params.id as string, 10);
    const { password, currentPassword } = req.body;
    await userService.updatePassword(userId, password, req.user!, currentPassword);
    res.json({ message: 'updated' });
  },

  async updateRole(req: Request, res: Response) {
    const userId = parseInt(req.params.id as string, 10);
    const { role } = req.body;
    await userService.updateRole(userId, role, req.user!);
    res.json({ message: 'updated' });
  },
};
