class SiteForm:
    def on_change(self, field):
        return self.handle_change(field)

    def handle_change(self, field):
        return field
