export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      pair_state: {
        Row: {
          cash_capital: number
          holding: string | null
          last_ask_a: number | null
          last_ask_b: number | null
          last_bid_a: number | null
          last_bid_b: number | null
          last_last_a: number | null
          last_last_b: number | null
          last_updated: string | null
          pair_id: string
          start_units_a: number
          units: number
        }
        Insert: {
          cash_capital?: number
          holding?: string | null
          last_ask_a?: number | null
          last_ask_b?: number | null
          last_bid_a?: number | null
          last_bid_b?: number | null
          last_last_a?: number | null
          last_last_b?: number | null
          last_updated?: string | null
          pair_id: string
          start_units_a?: number
          units?: number
        }
        Update: {
          cash_capital?: number
          holding?: string | null
          last_ask_a?: number | null
          last_ask_b?: number | null
          last_bid_a?: number | null
          last_bid_b?: number | null
          last_last_a?: number | null
          last_last_b?: number | null
          last_updated?: string | null
          pair_id?: string
          start_units_a?: number
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "pair_state_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: true
            referencedRelation: "pairs"
            referencedColumns: ["id"]
          },
        ]
      }
      pairs: {
        Row: {
          band_pct: number
          created_at: string
          fee_pct: number
          id: string
          label: string
          ma_window: number
          sample_interval_sec: number
          start_capital: number
          symbol_a: string
          symbol_b: string
          use_bid_ask: boolean
        }
        Insert: {
          band_pct?: number
          created_at?: string
          fee_pct?: number
          id: string
          label: string
          ma_window?: number
          sample_interval_sec?: number
          start_capital?: number
          symbol_a: string
          symbol_b: string
          use_bid_ask?: boolean
        }
        Update: {
          band_pct?: number
          created_at?: string
          fee_pct?: number
          id?: string
          label?: string
          ma_window?: number
          sample_interval_sec?: number
          start_capital?: number
          symbol_a?: string
          symbol_b?: string
          use_bid_ask?: boolean
        }
        Relationships: []
      }
      samples: {
        Row: {
          a: number
          b: number
          id: number
          pair_id: string
          ratio: number
          t: string
        }
        Insert: {
          a: number
          b: number
          id?: number
          pair_id: string
          ratio: number
          t?: string
        }
        Update: {
          a?: number
          b?: number
          id?: number
          pair_id?: string
          ratio?: number
          t?: string
        }
        Relationships: [
          {
            foreignKeyName: "samples_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "pairs"
            referencedColumns: ["id"]
          },
        ]
      }
      symbol_quotes: {
        Row: {
          ask: number | null
          bid: number | null
          fetched_at: string
          last: number | null
          symbol: string
        }
        Insert: {
          ask?: number | null
          bid?: number | null
          fetched_at?: string
          last?: number | null
          symbol: string
        }
        Update: {
          ask?: number | null
          bid?: number | null
          fetched_at?: string
          last?: number | null
          symbol?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          buy_price: number
          commission: number
          from_side: string
          gross_sale: number
          id: number
          new_capital: number
          new_units: number
          pair_id: string
          sell_price: number
          t: string
          to_side: string
          units_sold: number
        }
        Insert: {
          buy_price: number
          commission: number
          from_side: string
          gross_sale: number
          id?: number
          new_capital: number
          new_units: number
          pair_id: string
          sell_price: number
          t?: string
          to_side: string
          units_sold: number
        }
        Update: {
          buy_price?: number
          commission?: number
          from_side?: string
          gross_sale?: number
          id?: number
          new_capital?: number
          new_units?: number
          pair_id?: string
          sell_price?: number
          t?: string
          to_side?: string
          units_sold?: number
        }
        Relationships: [
          {
            foreignKeyName: "trades_pair_id_fkey"
            columns: ["pair_id"]
            isOneToOne: false
            referencedRelation: "pairs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
