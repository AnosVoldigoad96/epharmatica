export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      ai_keys: {
        Row: {
          created_at: string
          encrypted_key: string | null
          id: string
          last_validated_at: string | null
          provider: string
          storage_mode: Database['public']['Enums']['ai_key_storage_mode']
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_key?: string | null
          id?: string
          last_validated_at?: string | null
          provider: string
          storage_mode?: Database['public']['Enums']['ai_key_storage_mode']
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_key?: string | null
          id?: string
          last_validated_at?: string | null
          provider?: string
          storage_mode?: Database['public']['Enums']['ai_key_storage_mode']
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_models: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_default: boolean
          label: string
          model_id: string
          provider: string
          sort: number
          tier_note: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          label: string
          model_id: string
          provider: string
          sort?: number
          tier_note?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          model_id?: string
          provider?: string
          sort?: number
          tier_note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_rate_limits: {
        Row: {
          bucket: string
          created_at: string
          id: string
          request_count: number
          updated_at: string
          user_id: string
          window_start: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: string
          request_count?: number
          updated_at?: string
          user_id: string
          window_start: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: string
          request_count?: number
          updated_at?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          ip_hash: string | null
          meta: Json
          updated_at: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          ip_hash?: string | null
          meta?: Json
          updated_at?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          ip_hash?: string | null
          meta?: Json
          updated_at?: string
        }
        Relationships: []
      }
      auth_rate_limits: {
        Row: {
          bucket: string
          created_at: string
          id: string
          identifier: string
          request_count: number
          updated_at: string
          window_start: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: string
          identifier: string
          request_count?: number
          updated_at?: string
          window_start: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: string
          identifier?: string
          request_count?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      bookmarks: {
        Row: {
          created_at: string
          id: string
          target_id: string
          target_type: Database['public']['Enums']['bookmark_target']
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          target_id: string
          target_type: Database['public']['Enums']['bookmark_target']
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          target_id?: string
          target_type?: Database['public']['Enums']['bookmark_target']
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chapters: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          slug: string
          sort_order: number
          subject_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
          subject_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'chapters_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'subjects'
            referencedColumns: ['id']
          },
        ]
      }
      content_discussion_replies: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          discussion_id: string
          id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          discussion_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          discussion_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'content_discussion_replies_discussion_id_fkey'
            columns: ['discussion_id']
            isOneToOne: false
            referencedRelation: 'content_discussions'
            referencedColumns: ['id']
          },
        ]
      }
      content_discussions: {
        Row: {
          block_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          snapshot: string | null
          status: string
          subtopic_id: string
          suggested_text: string | null
          updated_at: string
        }
        Insert: {
          block_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          snapshot?: string | null
          status?: string
          subtopic_id: string
          suggested_text?: string | null
          updated_at?: string
        }
        Update: {
          block_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          snapshot?: string | null
          status?: string
          subtopic_id?: string
          suggested_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'content_discussions_subtopic_id_fkey'
            columns: ['subtopic_id']
            isOneToOne: false
            referencedRelation: 'subtopics'
            referencedColumns: ['id']
          },
        ]
      }
      content_review_events: {
        Row: {
          actor_id: string | null
          comment: string | null
          created_at: string
          from_status: Database['public']['Enums']['content_status'] | null
          id: string
          subtopic_id: string
          to_status: Database['public']['Enums']['content_status']
          updated_at: string
        }
        Insert: {
          actor_id?: string | null
          comment?: string | null
          created_at?: string
          from_status?: Database['public']['Enums']['content_status'] | null
          id?: string
          subtopic_id: string
          to_status: Database['public']['Enums']['content_status']
          updated_at?: string
        }
        Update: {
          actor_id?: string | null
          comment?: string | null
          created_at?: string
          from_status?: Database['public']['Enums']['content_status'] | null
          id?: string
          subtopic_id?: string
          to_status?: Database['public']['Enums']['content_status']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'content_review_events_subtopic_id_fkey'
            columns: ['subtopic_id']
            isOneToOne: false
            referencedRelation: 'subtopics'
            referencedColumns: ['id']
          },
        ]
      }
      content_revisions: {
        Row: {
          content: Json
          created_at: string
          editor_id: string | null
          id: string
          note: string | null
          subtopic_id: string
          updated_at: string
        }
        Insert: {
          content: Json
          created_at?: string
          editor_id?: string | null
          id?: string
          note?: string | null
          subtopic_id: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          editor_id?: string | null
          id?: string
          note?: string | null
          subtopic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'content_revisions_subtopic_id_fkey'
            columns: ['subtopic_id']
            isOneToOne: false
            referencedRelation: 'subtopics'
            referencedColumns: ['id']
          },
        ]
      }
      content_trash: {
        Row: {
          created_at: string
          deleted_at: string
          deleted_by: string | null
          entity_id: string
          entity_ids: string[]
          id: string
          level: Database['public']['Enums']['content_level']
          name: string
          pages: number
          published: number
          purge_after: string
          purged_at: string | null
          restored_at: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string
          deleted_by?: string | null
          entity_id: string
          entity_ids: string[]
          id?: string
          level: Database['public']['Enums']['content_level']
          name: string
          pages?: number
          published?: number
          purge_after: string
          purged_at?: string | null
          restored_at?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string
          deleted_by?: string | null
          entity_id?: string
          entity_ids?: string[]
          id?: string
          level?: Database['public']['Enums']['content_level']
          name?: string
          pages?: number
          published?: number
          purge_after?: string
          purged_at?: string | null
          restored_at?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'content_trash_deleted_by_fkey'
            columns: ['deleted_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      deletion_receipts: {
        Row: {
          created_at: string
          id: string
          purged_at: string
          updated_at: string
          user_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          purged_at?: string
          updated_at?: string
          user_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          purged_at?: string
          updated_at?: string
          user_hash?: string
        }
        Relationships: []
      }
      entitlements: {
        Row: {
          created_at: string
          feature: string
          id: string
          plan_id: string
          updated_at: string
          value: Json | null
        }
        Insert: {
          created_at?: string
          feature: string
          id?: string
          plan_id: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          created_at?: string
          feature?: string
          id?: string
          plan_id?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: 'entitlements_plan_id_fkey'
            columns: ['plan_id']
            isOneToOne: false
            referencedRelation: 'plans'
            referencedColumns: ['id']
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          key: string
          phase_tag: string | null
          updated_at: string
          value: Json | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          key: string
          phase_tag?: string | null
          updated_at?: string
          value?: Json | null
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          key?: string
          phase_tag?: string | null
          updated_at?: string
          value?: Json | null
        }
        Relationships: []
      }
      handle_quarantine: {
        Row: {
          created_at: string
          freed_after: string
          handle: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          freed_after: string
          handle: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          freed_after?: string
          handle?: string
          updated_at?: string
        }
        Relationships: []
      }
      highlights: {
        Row: {
          anchor: Json
          color: Database['public']['Enums']['highlight_color']
          created_at: string
          id: string
          moved: boolean
          orphaned: boolean
          subtopic_id: string
          text_snapshot: string
          updated_at: string
          user_id: string
        }
        Insert: {
          anchor: Json
          color: Database['public']['Enums']['highlight_color']
          created_at?: string
          id?: string
          moved?: boolean
          orphaned?: boolean
          subtopic_id: string
          text_snapshot: string
          updated_at?: string
          user_id: string
        }
        Update: {
          anchor?: Json
          color?: Database['public']['Enums']['highlight_color']
          created_at?: string
          id?: string
          moved?: boolean
          orphaned?: boolean
          subtopic_id?: string
          text_snapshot?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'highlights_subtopic_id_fkey'
            columns: ['subtopic_id']
            isOneToOne: false
            referencedRelation: 'subtopics'
            referencedColumns: ['id']
          },
        ]
      }
      last_visited: {
        Row: {
          created_at: string
          subtopic_id: string
          updated_at: string
          user_id: string
          visited_at: string
        }
        Insert: {
          created_at?: string
          subtopic_id: string
          updated_at?: string
          user_id: string
          visited_at?: string
        }
        Update: {
          created_at?: string
          subtopic_id?: string
          updated_at?: string
          user_id?: string
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'last_visited_subtopic_id_fkey'
            columns: ['subtopic_id']
            isOneToOne: false
            referencedRelation: 'subtopics'
            referencedColumns: ['id']
          },
        ]
      }
      media_assets: {
        Row: {
          alt: string
          bytes: number
          created_at: string
          deleted_at: string | null
          height: number
          id: string
          path: string
          replaced_at: string | null
          tags: string[]
          updated_at: string
          uploaded_by: string | null
          width: number
        }
        Insert: {
          alt: string
          bytes: number
          created_at?: string
          deleted_at?: string | null
          height: number
          id?: string
          path: string
          replaced_at?: string | null
          tags?: string[]
          updated_at?: string
          uploaded_by?: string | null
          width: number
        }
        Update: {
          alt?: string
          bytes?: number
          created_at?: string
          deleted_at?: string | null
          height?: number
          id?: string
          path?: string
          replaced_at?: string | null
          tags?: string[]
          updated_at?: string
          uploaded_by?: string | null
          width?: number
        }
        Relationships: []
      }
      media_refs: {
        Row: {
          asset_id: string
          created_at: string
          source: string
          subtopic_id: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          source?: string
          subtopic_id: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          source?: string
          subtopic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'media_refs_asset_id_fkey'
            columns: ['asset_id']
            isOneToOne: false
            referencedRelation: 'media_assets'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'media_refs_subtopic_id_fkey'
            columns: ['subtopic_id']
            isOneToOne: false
            referencedRelation: 'subtopics'
            referencedColumns: ['id']
          },
        ]
      }
      personal_data_registry: {
        Row: {
          created_at: string
          module: string
          notes: string | null
          purge_step: number
          table_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          module: string
          notes?: string | null
          purge_step: number
          table_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          module?: string
          notes?: string | null
          purge_step?: number
          table_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          key: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          key: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          key?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      preview_link_opens: {
        Row: {
          created_at: string
          id: string
          ip_hash: string | null
          link_id: string
          opened_at: string
          ua: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_hash?: string | null
          link_id: string
          opened_at?: string
          ua?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_hash?: string | null
          link_id?: string
          opened_at?: string
          ua?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'preview_link_opens_link_id_fkey'
            columns: ['link_id']
            isOneToOne: false
            referencedRelation: 'preview_links'
            referencedColumns: ['id']
          },
        ]
      }
      preview_links: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          revoked_at: string | null
          subtopic_id: string
          token_hash: string
          token_tail: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          revoked_at?: string | null
          subtopic_id: string
          token_hash: string
          token_tail?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          revoked_at?: string | null
          subtopic_id?: string
          token_hash?: string
          token_tail?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'preview_links_subtopic_id_fkey'
            columns: ['subtopic_id']
            isOneToOne: false
            referencedRelation: 'subtopics'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          country: string | null
          created_at: string
          deletion_requested_at: string | null
          display_name: string
          email_verified_at: string | null
          id: string
          institution: string | null
          is_verified_pharmacist: boolean
          prefs: Json
          role: Database['public']['Enums']['app_role']
          updated_at: string
          user_type: Database['public']['Enums']['user_type']
          username: string
          verified_at: string | null
          visibility: Database['public']['Enums']['profile_visibility']
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          display_name: string
          email_verified_at?: string | null
          id: string
          institution?: string | null
          is_verified_pharmacist?: boolean
          prefs?: Json
          role?: Database['public']['Enums']['app_role']
          updated_at?: string
          user_type?: Database['public']['Enums']['user_type']
          username: string
          verified_at?: string | null
          visibility?: Database['public']['Enums']['profile_visibility']
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          display_name?: string
          email_verified_at?: string | null
          id?: string
          institution?: string | null
          is_verified_pharmacist?: boolean
          prefs?: Json
          role?: Database['public']['Enums']['app_role']
          updated_at?: string
          user_type?: Database['public']['Enums']['user_type']
          username?: string
          verified_at?: string | null
          visibility?: Database['public']['Enums']['profile_visibility']
        }
        Relationships: []
      }
      progress: {
        Row: {
          completed_at: string
          created_at: string
          id: string
          subtopic_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          created_at?: string
          id?: string
          subtopic_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          id?: string
          subtopic_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'progress_subtopic_id_fkey'
            columns: ['subtopic_id']
            isOneToOne: false
            referencedRelation: 'subtopics'
            referencedColumns: ['id']
          },
        ]
      }
      reserved_usernames: {
        Row: {
          created_at: string
          handle: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          handle: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          handle?: string
          updated_at?: string
        }
        Relationships: []
      }
      review_claims: {
        Row: {
          claimed_at: string
          created_at: string
          id: string
          released_at: string | null
          reviewer_id: string
          subtopic_id: string
          updated_at: string
        }
        Insert: {
          claimed_at?: string
          created_at?: string
          id?: string
          released_at?: string | null
          reviewer_id: string
          subtopic_id: string
          updated_at?: string
        }
        Update: {
          claimed_at?: string
          created_at?: string
          id?: string
          released_at?: string | null
          reviewer_id?: string
          subtopic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'review_claims_subtopic_id_fkey'
            columns: ['subtopic_id']
            isOneToOne: false
            referencedRelation: 'subtopics'
            referencedColumns: ['id']
          },
        ]
      }
      site_settings: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      slug_history: {
        Row: {
          created_at: string
          entity_id: string
          id: string
          level: Database['public']['Enums']['content_level']
          new_slug: string
          old_slug: string
          parent_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          id?: string
          level: Database['public']['Enums']['content_level']
          new_slug: string
          old_slug: string
          parent_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          id?: string
          level?: Database['public']['Enums']['content_level']
          new_slug?: string
          old_slug?: string
          parent_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      subjects: {
        Row: {
          created_at: string
          default_semester: number | null
          deleted_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_semester?: number | null
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_semester?: number | null
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      subtopics: {
        Row: {
          chapter_id: string | null
          content: Json
          created_at: string
          deleted_at: string | null
          headings_text: string
          id: string
          plain_text: string
          preview_block_count: number | null
          primary_video_url: string | null
          published_at: string | null
          published_content: Json | null
          published_headings_text: string
          published_plain_text: string
          reading_minutes: number
          search_vector: unknown
          slug: string
          sort_order: number
          status: Database['public']['Enums']['content_status']
          title: string
          topic_id: string | null
          updated_at: string
        }
        Insert: {
          chapter_id?: string | null
          content?: Json
          created_at?: string
          deleted_at?: string | null
          headings_text?: string
          id?: string
          plain_text?: string
          preview_block_count?: number | null
          primary_video_url?: string | null
          published_at?: string | null
          published_content?: Json | null
          published_headings_text?: string
          published_plain_text?: string
          reading_minutes?: number
          search_vector?: unknown
          slug: string
          sort_order?: number
          status?: Database['public']['Enums']['content_status']
          title: string
          topic_id?: string | null
          updated_at?: string
        }
        Update: {
          chapter_id?: string | null
          content?: Json
          created_at?: string
          deleted_at?: string | null
          headings_text?: string
          id?: string
          plain_text?: string
          preview_block_count?: number | null
          primary_video_url?: string | null
          published_at?: string | null
          published_content?: Json | null
          published_headings_text?: string
          published_plain_text?: string
          reading_minutes?: number
          search_vector?: unknown
          slug?: string
          sort_order?: number
          status?: Database['public']['Enums']['content_status']
          title?: string
          topic_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'subtopics_chapter_id_fkey'
            columns: ['chapter_id']
            isOneToOne: false
            referencedRelation: 'chapters'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'subtopics_topic_id_fkey'
            columns: ['topic_id']
            isOneToOne: false
            referencedRelation: 'topics'
            referencedColumns: ['id']
          },
        ]
      }
      topics: {
        Row: {
          chapter_id: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          semester: number | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          semester?: number | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          semester?: number | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'topics_chapter_id_fkey'
            columns: ['chapter_id']
            isOneToOne: false
            referencedRelation: 'chapters'
            referencedColumns: ['id']
          },
        ]
      }
      user_notes: {
        Row: {
          content: Json
          created_at: string
          highlight_id: string | null
          id: string
          source: string
          source_label: string | null
          subtopic_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: Json
          created_at?: string
          highlight_id?: string | null
          id?: string
          source?: string
          source_label?: string | null
          subtopic_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          highlight_id?: string | null
          id?: string
          source?: string
          source_label?: string | null
          subtopic_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_notes_highlight_id_fkey'
            columns: ['highlight_id']
            isOneToOne: false
            referencedRelation: 'highlights'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_notes_subtopic_id_fkey'
            columns: ['subtopic_id']
            isOneToOne: false
            referencedRelation: 'subtopics'
            referencedColumns: ['id']
          },
        ]
      }
      waitlist_signups: {
        Row: {
          created_at: string
          email: string
          id: string
          module: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          module: string
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          module?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _subtopic_author_of_record: {
        Args: { p_subtopic_id: string }
        Returns: string
      }
      admin_force_rename: {
        Args: { p_new_username: string; p_target: string }
        Returns: string
      }
      admin_search_users: {
        Args: { p_query: string }
        Returns: {
          created_at: string
          deletion_requested_at: string
          display_name: string
          email: string
          email_confirmed_at: string
          id: string
          role: Database['public']['Enums']['app_role']
          username: string
        }[]
      }
      admin_set_role: {
        Args: {
          p_new_role: Database['public']['Enums']['app_role']
          p_target: string
        }
        Returns: undefined
      }
      auth_rate_limit_hit: {
        Args: { p_bucket: string; p_identifier: string; p_window_start: string }
        Returns: number
      }
      can_feature: { Args: { feature_key: string }; Returns: boolean }
      count_affected_highlights: {
        Args: { p_subtopic_ids: string[] }
        Returns: number
      }
      delete_content_node: {
        Args: {
          p_entity_id: string
          p_level: Database['public']['Enums']['content_level']
        }
        Returns: string
      }
      has_role: { Args: { required_roles: string[] }; Returns: boolean }
      move_content_node: {
        Args: {
          p_entity_id: string
          p_level: Database['public']['Enums']['content_level']
          p_new_parent_id: string
          p_new_parent_level?: Database['public']['Enums']['content_level']
        }
        Returns: string[]
      }
      open_preview_link: {
        Args: { p_ip_hash: string; p_token: string; p_ua: string }
        Returns: Json
      }
      prune_audit_log: {
        Args: { p_from: string; p_to: string }
        Returns: number
      }
      publish_subtopic: {
        Args: {
          p_primary_video_url: string
          p_reading_minutes: number
          p_subtopic_id: string
        }
        Returns: undefined
      }
      purge_content_trash: { Args: { p_trash_id?: string }; Returns: number }
      refresh_media_refs: {
        Args: { p_asset_ids: string[]; p_source: string; p_subtopic_id: string }
        Returns: undefined
      }
      rename_content_node: {
        Args: {
          p_entity_id: string
          p_level: Database['public']['Enums']['content_level']
          p_new_slug: string
        }
        Returns: string[]
      }
      restore_content_node: { Args: { p_trash_id: string }; Returns: undefined }
      restore_revision: { Args: { p_revision_id: string }; Returns: string }
      role_rank: {
        Args: { p_role: Database['public']['Enums']['app_role'] }
        Returns: number
      }
      search_published: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          chapter_name: string
          chapter_slug: string
          rank: number
          slug: string
          snippet: string
          subject_name: string
          subject_slug: string
          subtopic_id: string
          title: string
          topic_name: string
          topic_slug: string
        }[]
      }
      staff_directory: {
        Args: never
        Returns: {
          display_name: string
          id: string
          role: Database['public']['Enums']['app_role']
          username: string
        }[]
      }
      transition_subtopic: {
        Args: { p_action: string; p_comment?: string; p_subtopic_id: string }
        Returns: undefined
      }
      username_available: { Args: { candidate: string }; Returns: boolean }
    }
    Enums: {
      ai_key_storage_mode: 'device' | 'sync'
      app_role:
        | 'user'
        | 'author'
        | 'reviewer'
        | 'content_manager'
        | 'blog_editor'
        | 'moderator'
        | 'jobs_manager'
        | 'support'
        | 'admin'
        | 'super_admin'
      bookmark_target: 'subtopic' | 'topic'
      content_level: 'subject' | 'chapter' | 'topic' | 'subtopic'
      content_status:
        'draft' | 'in_review' | 'changes_requested' | 'approved' | 'published' | 'archived'
      highlight_color: 'amber' | 'mint' | 'lilac' | 'rose'
      profile_visibility: 'unset' | 'public' | 'private'
      user_type: 'student' | 'pharmacist' | 'other'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_key_storage_mode: ['device', 'sync'],
      app_role: [
        'user',
        'author',
        'reviewer',
        'content_manager',
        'blog_editor',
        'moderator',
        'jobs_manager',
        'support',
        'admin',
        'super_admin',
      ],
      bookmark_target: ['subtopic', 'topic'],
      content_level: ['subject', 'chapter', 'topic', 'subtopic'],
      content_status: [
        'draft',
        'in_review',
        'changes_requested',
        'approved',
        'published',
        'archived',
      ],
      highlight_color: ['amber', 'mint', 'lilac', 'rose'],
      profile_visibility: ['unset', 'public', 'private'],
      user_type: ['student', 'pharmacist', 'other'],
    },
  },
} as const
