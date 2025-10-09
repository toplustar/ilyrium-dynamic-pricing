import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Unhandled error:', err);

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' 
      ? err.message 
      : 'Internal server error',
  });
};

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
};

