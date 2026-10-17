# frozen_string_literal: true

module PostTranslation
  # Keep executable examples byte-for-byte identical in both languages.
  def with_original_code(markdown, post_path)
    site = @context.registers[:site]
    source = File.expand_path(post_path, site.source)
    posts_directory = File.expand_path('_posts', site.source) + File::SEPARATOR
    raise ArgumentError, 'Translation source must be a post' unless source.start_with?(posts_directory)

    blocks = File.read(source, encoding: 'UTF-8').scan(/^```[^\n]*\n.*?^```[ \t]*\r?$/m)
    markdown.gsub(/<!-- original-code:(\d+) -->/) do
      blocks.fetch(Regexp.last_match(1).to_i)
    end
  end
end

Liquid::Template.register_filter(PostTranslation)
