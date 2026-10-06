export interface Capture {
  id: string;
  name: string;
  device: string;
  app_version: string;
  created: string;
  frame_count: number;
  has_depth: boolean;
  has_pointcloud: boolean;
  has_mesh: boolean;
  has_splats: boolean;
  pointclouds: string[];
  meshes: string[];
  splats: string[];
  has_thumbnail: boolean;
  camera_info?: {
    w?: number;
    h?: number;
    camera_model?: string;
  };
  size_bytes: number;
}

export interface Job {
  id: string;
  type: string;
  capture_id: string;
  name: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  status_message: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
  result?: any;
  log_count: number;
}

export interface SystemStatus {
  name: string;
  version: number;
  port: number;
  lan_ip: string;
  lan_url: string;
  colab_cli: {
    available: boolean;
    authenticated: boolean;
    message: string;
  };
  captures_count: number;
  active_jobs: number;
}
