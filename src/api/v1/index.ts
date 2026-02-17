import { Router } from 'express';
import documentsRouter from './documents';

const v1Router = Router();

v1Router.use('/documents', documentsRouter);

export default v1Router;
