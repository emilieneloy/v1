export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      tests: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          status: "draft" | "active" | "paused" | "completed";
          product_ids: string[] | null;
          user_id: string;
          created_at: string;
          started_at: string | null;
          ended_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          status?: "draft" | "active" | "paused" | "completed";
          product_ids?: string[] | null;
          user_id: string;
          created_at?: string;
          started_at?: string | null;
          ended_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          status?: "draft" | "active" | "paused" | "completed";
          product_ids?: string[] | null;
          user_id?: string;
          created_at?: string;
          started_at?: string | null;
          ended_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fk_tests_user";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      variants: {
        Row: {
          id: string;
          test_id: string;
          name: string;
          weight: number;
          discount_code: string | null;
          price_modifier_cents: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          test_id: string;
          name: string;
          weight?: number;
          discount_code?: string | null;
          price_modifier_cents?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          test_id?: string;
          name?: string;
          weight?: number;
          discount_code?: string | null;
          price_modifier_cents?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fk_variants_test";
            columns: ["test_id"];
            isOneToOne: false;
            referencedRelation: "tests";
            referencedColumns: ["id"];
          },
        ];
      };
      assignments: {
        Row: {
          id: string;
          test_id: string;
          variant_id: string;
          visitor_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          test_id: string;
          variant_id: string;
          visitor_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          test_id?: string;
          variant_id?: string;
          visitor_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fk_assignments_test";
            columns: ["test_id"];
            isOneToOne: false;
            referencedRelation: "tests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_assignments_variant";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "variants";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          id: string;
          test_id: string;
          variant_id: string;
          visitor_id: string;
          event_type: "view" | "add_to_cart" | "purchase";
          product_id: string | null;
          order_id: string | null;
          revenue_cents: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          test_id: string;
          variant_id: string;
          visitor_id: string;
          event_type: "view" | "add_to_cart" | "purchase";
          product_id?: string | null;
          order_id?: string | null;
          revenue_cents?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          test_id?: string;
          variant_id?: string;
          visitor_id?: string;
          event_type?: "view" | "add_to_cart" | "purchase";
          product_id?: string | null;
          order_id?: string | null;
          revenue_cents?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fk_events_test";
            columns: ["test_id"];
            isOneToOne: false;
            referencedRelation: "tests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_events_variant";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "variants";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          avatar_url: string | null;
          created_at: string | null;
          email: string;
          full_name: string | null;
          id: string;
          updated_at: string | null;
          shopify_store: string | null;
          shopify_access_token: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string | null;
          email: string;
          full_name?: string | null;
          id: string;
          updated_at?: string | null;
          shopify_store?: string | null;
          shopify_access_token?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string | null;
          email?: string;
          full_name?: string | null;
          id?: string;
          updated_at?: string | null;
          shopify_store?: string | null;
          shopify_access_token?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fk_auth_user";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      test_stats: {
        Row: {
          test_id: string;
          variant_id: string;
          variant_name: string;
          visitors: number;
          conversions: number;
          revenue_cents: number;
        };
      };
    };
    Functions: {
      refresh_test_stats: {
        Args: Record<string, never>;
        Returns: void;
      };
    };
    Enums: {
      test_status: "draft" | "active" | "paused" | "completed";
      event_type: "view" | "add_to_cart" | "purchase";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never;

// Convenience type exports
export type Test = Tables<"tests">;
export type TestInsert = TablesInsert<"tests">;
export type TestUpdate = TablesUpdate<"tests">;

export type Variant = Tables<"variants">;
export type VariantInsert = TablesInsert<"variants">;
export type VariantUpdate = TablesUpdate<"variants">;

export type Assignment = Tables<"assignments">;
export type AssignmentInsert = TablesInsert<"assignments">;

export type Event = Tables<"events">;
export type EventInsert = TablesInsert<"events">;

export type TestStats = Database["public"]["Views"]["test_stats"]["Row"];

export type User = Tables<"users">;
