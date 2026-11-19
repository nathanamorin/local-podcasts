package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/getkin/kin-openapi/openapi2"
	"github.com/getkin/kin-openapi/openapi2conv"
	"github.com/labstack/echo/v4"
	"github.com/nathanamorin/local-podcasts/apidocs"
	"github.com/swaggo/swag"
	"k8s.io/klog/v2"
)

// redocHTML renders the Redoc UI, pointing it at the dynamically generated
// OpenAPI 3 spec served by OpenAPISpec.
const redocHTML = `<!DOCTYPE html>
<html>
  <head>
    <title>local-podcasts API docs</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body { margin: 0; padding: 0; }</style>
  </head>
  <body>
    <redoc spec-url="/openapi.json"></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundle.js"></script>
  </body>
</html>`

// OpenAPISpec godoc
// @Summary      OpenAPI 3 spec
// @Description  Returns an OpenAPI 3.0 document generated from the Go handler annotations at build time.
// @Tags         docs
// @Produce      json
// @Success      200  {object}  map[string]interface{}
// @Failure      500  {object}  map[string]string
// @Router       /openapi.json [get]
func (h *Handler) OpenAPISpec(c echo.Context) error {
	// apidocs.SwaggerInfo is generated at build time (see `swag init`) from the
	// @-annotations on handler functions in this package. It is parsed here
	// and converted from Swagger 2.0 to OpenAPI 3.0 on every request so the
	// served spec always reflects the binary's current build.
	rawSwagger, err := swag.ReadDoc(apidocs.SwaggerInfo.InstanceName())
	if err != nil {
		klog.Errorf("error reading generated swagger doc: %s", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "error generating openapi spec"})
	}

	var doc2 openapi2.T
	if err := json.Unmarshal([]byte(rawSwagger), &doc2); err != nil {
		klog.Errorf("error parsing generated swagger doc: %s", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "error generating openapi spec"})
	}

	doc3, err := openapi2conv.ToV3(&doc2)
	if err != nil {
		klog.Errorf("error converting swagger doc to openapi3: %s", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "error generating openapi spec"})
	}

	return c.JSON(http.StatusOK, doc3)
}

// APIDocs godoc
// @Summary      API documentation
// @Description  Renders a Redoc UI for browsing the OpenAPI spec served at /openapi.json.
// @Tags         docs
// @Produce      html
// @Success      200
// @Router       /doc [get]
// @Router       /docs [get]
func (h *Handler) APIDocs(c echo.Context) error {
	return c.HTML(http.StatusOK, redocHTML)
}
