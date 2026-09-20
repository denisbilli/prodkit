class ArticlesController < ApplicationController
  def index
    render json: Article.all
  end

  def show
    render json: Article.find(params[:id])
  end

  def create
    render json: Article.create!(article_params)
  end

  private

  def article_params
    params.require(:article).permit(:title, :body)
  end
end
