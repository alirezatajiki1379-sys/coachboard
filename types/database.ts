export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          club_name: string | null;
          preferred_language: string;
          default_age_group: string | null;
          default_pitch_background: string | null;
          pdf_branding_name: string | null;
          logo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          club_name?: string | null;
          preferred_language?: string;
          default_age_group?: string | null;
          default_pitch_background?: string | null;
          pdf_branding_name?: string | null;
          logo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      drills: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          short_description: string | null;
          organization: string | null;
          coaching_points: string | null;
          variations: string | null;
          easier_version: string | null;
          harder_version: string | null;
          age_groups: string[];
          main_focus: string;
          sub_focus: string | null;
          training_blocks: string[];
          drill_type: string;
          duration_minutes: number;
          min_players: number;
          max_players: number;
          materials: Json;
          pitch_area: string | null;
          difficulty_level: number;
          intensity_level: number;
          is_favorite: boolean;
          tags: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          short_description?: string | null;
          organization?: string | null;
          coaching_points?: string | null;
          variations?: string | null;
          easier_version?: string | null;
          harder_version?: string | null;
          age_groups?: string[];
          main_focus: string;
          sub_focus?: string | null;
          training_blocks?: string[];
          drill_type: string;
          duration_minutes?: number;
          min_players?: number;
          max_players?: number;
          materials?: Json;
          pitch_area?: string | null;
          difficulty_level?: number;
          intensity_level?: number;
          is_favorite?: boolean;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          short_description?: string | null;
          organization?: string | null;
          coaching_points?: string | null;
          variations?: string | null;
          easier_version?: string | null;
          harder_version?: string | null;
          age_groups?: string[];
          main_focus?: string;
          sub_focus?: string | null;
          training_blocks?: string[];
          drill_type?: string;
          duration_minutes?: number;
          min_players?: number;
          max_players?: number;
          materials?: Json;
          pitch_area?: string | null;
          difficulty_level?: number;
          intensity_level?: number;
          is_favorite?: boolean;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      drill_graphics: {
        Row: {
          id: string;
          drill_id: string;
          user_id: string;
          canvas_json: Json;
          preview_image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["drill_graphics"]["Row"]> & {
          drill_id: string;
          user_id: string;
          canvas_json: Json;
        };
        Update: Partial<Database["public"]["Tables"]["drill_graphics"]["Row"]>;
        Relationships: [];
      };
      drill_graphic_templates: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          template_json: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          template_json: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["drill_graphic_templates"]["Row"]>;
        Relationships: [];
      };
      materials: {
        Row: {
          id: string;
          user_id: string;
          drill_id: string | null;
          material_type: string;
          color: string | null;
          label: string | null;
          quantity: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["materials"]["Row"]> & {
          user_id: string;
          material_type: string;
        };
        Update: Partial<Database["public"]["Tables"]["materials"]["Row"]>;
        Relationships: [];
      };
      training_sessions: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          session_date: string | null;
          start_time: string | null;
          team_age_group: string | null;
          main_focus: string | null;
          secondary_focus: string | null;
          expected_players: number | null;
          duration_target_minutes: number | null;
          location: string | null;
          notes: string | null;
          player_groups: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["training_sessions"]["Row"]> & {
          user_id: string;
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["training_sessions"]["Row"]>;
        Relationships: [];
      };
      training_session_drills: {
        Row: {
          id: string;
          user_id: string;
          session_id: string;
          drill_id: string;
          block: string;
          order_index: number;
          planned_duration_minutes: number;
          coach_notes: string | null;
          timing_mode: "sequential" | "simultaneous";
          simultaneous_group: string | null;
          participating_groups: string[] | null;
          starting_group: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["training_session_drills"]["Row"]> & {
          user_id: string;
          session_id: string;
          drill_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["training_session_drills"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
